"""Check 2 — dead links.

The only thing this check is allowed to conclude is what a server said. A request
that timed out, hit a closed connection, failed TLS, or was rate limited proves
nothing about the link, so it comes back `unverifiable / network_error`. Only a
404 or a 410, confirmed with a GET, is a `diverges`.

Two sources of false positives are handled here explicitly:

  - LaTeX escaping. `\\url{https://x.org/a\\_b}` is a live URL with an underscore,
    not a dead URL with a backslash in it.
  - Servers that refuse HEAD. A great many answer 403/405/501 to HEAD and 200 to
    GET, so HEAD is only ever used as a cheap first attempt.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Sequence

from ..adapters.http import ErrorKind, HttpClient, HttpResponse, get_http_client, run_sync
from ..models import Anchor, CheckContext, CheckResult, Finding, ReasonCode, Severity, Verdict

CHECKER_NAME = "dead_links"
CHECKER_VERSION = "1.0.0"
DISPLAY_NAME = "Dead links"
DESCRIPTION = "Requests every URL in the paper and reports the ones the server says are gone."

# Statuses where HEAD tells us about the server's HEAD support, not the resource.
HEAD_UNSUPPORTED = frozenset({400, 401, 403, 405, 406, 409, 429, 501, 502})

DEAD_STATUSES = frozenset({404, 410})


# --------------------------------------------------------------------------
# LaTeX URL extraction
# --------------------------------------------------------------------------

# Characters LaTeX escapes with a backslash that are legal inside a URL.
_ESCAPED = {
    r"\_": "_", r"\&": "&", r"\#": "#", r"\%": "%", r"\$": "$",
    r"\{": "{", r"\}": "}", r"\~": "~", r"\^": "^", r"\|": "|",
}
# Line-breaking helpers the `url` package accepts; they are not part of the URL.
_DROPPED = (r"\-", r"\/", r"\allowbreak", r"\linebreak", r"\break", r"\,", r"\ ", "~{}", "{}")

_BARE_URL = re.compile(r"(?<![\w@])(https?://[^\s<>\"'`\\{}$]+)")

_SECTION_CMD = re.compile(r"\\(section|subsection|subsubsection|paragraph)\*?\s*\{")
_FOOTNOTE_CMD = re.compile(r"\\(footnote|blfootnote|footnotetext|thanks)\s*\{")


@dataclass(frozen=True)
class ExtractedUrl:
    """One URL as it appears in the source, with where it appeared."""

    url: str
    raw: str
    source: str  # url | href | bare
    char_start: int
    char_end: int
    locator: str = ""

    def anchor(self, index: int) -> Anchor:
        return Anchor(
            kind="link",
            dom_id=f"link/{index}",
            char_start=self.char_start,
            char_end=self.char_end,
            human_locator=self.locator or "in the body",
        )


def mask_comments(latex: str) -> str:
    """Replace LaTeX comments with spaces, preserving every character offset.

    A commented-out URL is not in the paper. The Transformer fixture has exactly
    one of these — a `\\blfootnote` behind a `%` — and reporting it would be wrong.
    """
    out = list(latex)
    i, n = 0, len(latex)
    in_comment = False
    while i < n:
        ch = latex[i]
        if in_comment:
            if ch == "\n":
                in_comment = False
            else:
                out[i] = " "
        elif ch == "\\" and i + 1 < n:
            i += 2
            continue
        elif ch == "%":
            in_comment = True
            out[i] = " "
        i += 1
    return "".join(out)


def _match_brace(text: str, open_index: int) -> int:
    """Index just past the `}` matching the `{` at `open_index`, or -1."""
    depth = 0
    i, n = open_index, len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1


def clean_url(raw: str) -> str:
    """Undo LaTeX escaping and line wrapping. This is where dead-link false
    positives are prevented, so it runs before anything touches the network."""
    text = raw.strip()
    for token in _DROPPED:
        text = text.replace(token, "")
    for escaped, plain in _ESCAPED.items():
        text = text.replace(escaped, plain)
    # A wrapped URL in the source is one URL.
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"\\(?:url|href|nolinkurl|texttt)", "", text)
    text = text.strip("{}")
    # Sentence punctuation glued to a bare URL is not part of it.
    text = text.rstrip(".,;:!?'\"")
    while text.endswith(")") and text.count(")") > text.count("("):
        text = text[:-1]
    return text


def extract_urls(latex: str) -> list[ExtractedUrl]:
    """`\\url{...}`, `\\href{...}{...}`, and bare http(s) URLs, in document order."""
    masked = mask_comments(latex)
    found: list[ExtractedUrl] = []
    covered: list[tuple[int, int]] = []

    for match in re.finditer(r"\\(url|href|nolinkurl)\s*\{", masked):
        open_index = match.end() - 1
        close = _match_brace(masked, open_index)
        if close < 0:
            continue
        raw = masked[open_index + 1 : close - 1]
        end = close
        if match.group(1) == "href":
            # The second group is the link text; it belongs to the span, not the URL.
            rest = masked[close:]
            offset = len(rest) - len(rest.lstrip())
            if rest[offset : offset + 1] == "{":
                text_close = _match_brace(masked, close + offset)
                if text_close > 0:
                    end = text_close
        url = clean_url(raw)
        covered.append((match.start(), end))
        if _is_http(url):
            found.append(ExtractedUrl(url=url, raw=raw, source=match.group(1).replace("nolinkurl", "url"),
                                      char_start=match.start(), char_end=end,
                                      locator=describe_location(masked, match.start())))

    for match in _BARE_URL.finditer(masked):
        if any(start <= match.start() < end for start, end in covered):
            continue
        url = clean_url(match.group(1))
        if _is_http(url):
            found.append(ExtractedUrl(url=url, raw=match.group(1), source="bare",
                                      char_start=match.start(), char_end=match.end(),
                                      locator=describe_location(masked, match.start())))

    found.sort(key=lambda u: u.char_start)
    return found


def _is_http(url: str) -> bool:
    return bool(re.match(r"^https?://[^/\s]+", url))


def describe_location(latex: str, pos: int) -> str:
    """A human locator such as `§4.1, footnote 3` — what §5.2 and the gutter show."""
    parts: list[str] = []
    section = _section_at(latex, pos)
    if section:
        parts.append(section)
    elif _in_environment(latex, pos, "abstract"):
        parts.append("abstract")
    footnote = _footnote_at(latex, pos)
    if footnote:
        parts.append(footnote)
    return ", ".join(parts)


def _section_at(latex: str, pos: int) -> str:
    section_no = 0
    sub_no = 0
    label = ""
    for match in _SECTION_CMD.finditer(latex, 0, pos):
        kind = match.group(1)
        close = _match_brace(latex, match.end() - 1)
        title = latex[match.end() : close - 1] if close > 0 else ""
        title = re.sub(r"\\[a-zA-Z]+\s*|[{}]", "", title).strip()
        if kind == "section":
            section_no += 1
            sub_no = 0
            label = f"§{section_no}"
        elif kind == "subsection" and section_no:
            sub_no += 1
            label = f"§{section_no}.{sub_no}"
        elif kind == "subsubsection" and sub_no:
            label = f"§{section_no}.{sub_no}"
        else:
            continue
        if title:
            label = f"{label} {title}"
    return label


def _footnote_at(latex: str, pos: int) -> str:
    index = 0
    for match in _FOOTNOTE_CMD.finditer(latex):
        if match.start() > pos:
            break
        index += 1
        close = _match_brace(latex, match.end() - 1)
        if close > pos >= match.start():
            return f"footnote {index}"
    return ""


def _in_environment(latex: str, pos: int, name: str) -> bool:
    begin = latex.rfind(f"\\begin{{{name}}}", 0, pos)
    if begin < 0:
        return False
    end = latex.find(f"\\end{{{name}}}", begin)
    return end < 0 or end > pos


# --------------------------------------------------------------------------
# Liveness
# --------------------------------------------------------------------------


@dataclass
class UrlCheck:
    url: str
    verdict: Verdict
    status: int | None = None
    reason: ReasonCode | None = None
    detail: str = ""
    final_url: str = ""
    occurrences: list[ExtractedUrl] = field(default_factory=list)

    @property
    def redirected(self) -> bool:
        return bool(self.final_url) and self.final_url.rstrip("/") != self.url.rstrip("/")


async def check_url(client: HttpClient, url: str) -> UrlCheck:
    """HEAD, then GET when HEAD is refused or claims the resource is gone.

    Confirming a 404 with a GET costs one request on the small number of links
    that look dead, and removes the largest remaining class of false accusation.
    """
    response = await client.head(url)
    if response.failed or response.status in HEAD_UNSUPPORTED or response.status in DEAD_STATUSES:
        get = await client.get(url)
        # A HEAD that reached a server still beats a GET that did not.
        if not (get.failed and not response.failed):
            response = get

    return _classify(url, response)


def _classify(url: str, response: HttpResponse) -> UrlCheck:
    if response.failed:
        kind = response.error_kind or ErrorKind.UNKNOWN
        reason = ReasonCode.RATE_LIMITED if kind is ErrorKind.RATE_LIMITED else ReasonCode.NETWORK_ERROR
        return UrlCheck(url=url, verdict=Verdict.UNVERIFIABLE, reason=reason,
                        detail=f"{kind.value}: {response.error_detail}".strip(": "))

    status = response.status
    if response.ok:
        return UrlCheck(url=url, verdict=Verdict.MATCHES, status=status, final_url=response.final_url,
                        detail=f"HTTP {status}")
    if status in DEAD_STATUSES:
        return UrlCheck(url=url, verdict=Verdict.DIVERGES, status=status, final_url=response.final_url,
                        detail=f"HTTP {status}")
    # 401/403/451 and anything else: the server answered, but not about existence.
    return UrlCheck(url=url, verdict=Verdict.UNVERIFIABLE, status=status, reason=ReasonCode.NETWORK_ERROR,
                    final_url=response.final_url,
                    detail=f"HTTP {status} — server answered but did not confirm the resource")


async def check_urls(client: HttpClient, urls: Sequence[ExtractedUrl]) -> list[UrlCheck]:
    """One request set per distinct URL, however many times it appears."""
    by_url: dict[str, list[ExtractedUrl]] = {}
    for item in urls:
        by_url.setdefault(item.url, []).append(item)

    results: list[UrlCheck] = []
    for url, occurrences in by_url.items():
        result = await check_url(client, url)
        result.occurrences = occurrences
        results.append(result)
    return results


# --------------------------------------------------------------------------
# Check entry point
# --------------------------------------------------------------------------


async def run_async(ctx: CheckContext, client: HttpClient) -> CheckResult:
    started = datetime.now(timezone.utc)
    urls = extract_urls(ctx.document.assembled_latex)
    if not urls:
        return _result(Verdict.NOT_ATTEMPTED, started, findings=[],
                       reason=None)

    results = await check_urls(client, urls)
    findings = list(_findings(results))

    if any(r.verdict is Verdict.DIVERGES for r in results):
        verdict, reason = Verdict.DIVERGES, None
    elif any(r.verdict is Verdict.UNVERIFIABLE for r in results):
        verdict = Verdict.UNVERIFIABLE
        reason = (ReasonCode.RATE_LIMITED
                  if all(r.reason is ReasonCode.RATE_LIMITED
                         for r in results if r.verdict is Verdict.UNVERIFIABLE)
                  else ReasonCode.NETWORK_ERROR)
    else:
        verdict, reason = Verdict.MATCHES, None

    return _result(verdict, started, findings=findings, reason=reason)


def _findings(results: Iterable[UrlCheck]) -> Iterable[Finding]:
    for result in results:
        if result.verdict is not Verdict.DIVERGES:
            continue
        for index, occurrence in enumerate(result.occurrences):
            yield Finding(
                severity=Severity.LOW,
                claimed=result.url,
                computed=result.detail,
                anchor=occurrence.anchor(index),
                explanation=(
                    f"The server returned {result.detail} for this link"
                    + (f" ({occurrence.locator})." if occurrence.locator else ".")
                ),
            )


def _result(verdict: Verdict, started: datetime, *, findings: list[Finding],
            reason: ReasonCode | None) -> CheckResult:
    now = datetime.now(timezone.utc)
    return CheckResult(
        checker=CHECKER_NAME,
        checker_version=CHECKER_VERSION,
        verdict=verdict,
        reason=reason,
        findings=findings,
        display_name=DISPLAY_NAME,
        description=DESCRIPTION,
        duration_ms=int((now - started).total_seconds() * 1000),
        created_at=now,
    )


def run(ctx: CheckContext) -> CheckResult:
    """Synchronous entry point discovered by the registry."""

    async def _go() -> CheckResult:
        client = get_http_client()
        try:
            return await run_async(ctx, client)
        finally:
            await client.aclose()

    return run_sync(_go())
