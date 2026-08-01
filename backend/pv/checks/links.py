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

The claim is the URL: writing it in a paper asserts that the resource is there.
`observe` records what the server said; `pv.adjudicate` turns "confirmed absent"
into `diverges` and everything short of that into `unverifiable`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Sequence

from ..adapters.http import ErrorKind, HttpClient, HttpResponse, get_http_client, run_sync
from ..adjudicate import Judgement, default_policy, judge_all, result_fingerprint
from ..fingerprint import claim_content_hash
from ..models import (
    Anchor,
    CheckContext,
    CheckResult,
    Claim,
    Finding,
    Observation,
    ReasonCode,
    Severity,
    Verdict,
)

CHECKER_NAME = "dead_links"
CHECKER_VERSION = "1.0.0"
DISPLAY_NAME = "Dead links"
DESCRIPTION = "Requests every URL in the paper and reports the ones the server says are gone."
# A server either answered or it did not. Nothing here is a matter of degree, so
# there is no tolerance entry to read.
POLICY_KEYS: tuple[str, ...] = ()

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
# Claims
# --------------------------------------------------------------------------


def link_claims(latex: str) -> list[Claim]:
    """One claim per URL occurrence, in document order.

    Each *occurrence* is its own claim, and the anchor index is the position in
    the document rather than within the URL's own occurrences, so two mentions of
    one URL are two rows with two identities. `check_urls` still makes one request
    per distinct URL; identity and traffic are different questions.
    """
    return [_claim(index, item) for index, item in enumerate(extract_urls(latex))]


def _claim(index: int, item: ExtractedUrl) -> Claim:
    anchor = item.anchor(index)
    return Claim(
        kind="link",
        locator=item.locator or "in the body",
        verbatim=item.url,
        anchor=anchor,
        normalized={"url": item.url, "raw": item.raw, "source": item.source},
        content_hash=claim_content_hash("link", anchor.dom_id, item.url, None),
    )


def applies(claim: Claim, ctx: CheckContext) -> bool:  # noqa: ARG001
    """A URL in the paper claims that a resource is there."""
    return claim.kind == "link" and bool(claim.normalized.get("url") or claim.verbatim)


def claims_for(ctx: CheckContext) -> list[Claim]:
    """The link claims to evaluate: the caller's, or freshly mined.

    Falls back to the same producer the orchestrator would use, so a checker run
    with an unpopulated `ctx.claims` examines exactly the same URLs.
    """
    supplied = [c for c in ctx.claims if applies(c, ctx)]
    return supplied or link_claims(ctx.document.assembled_latex)


def _url_of(claim: Claim) -> str:
    return str(claim.normalized.get("url") or claim.verbatim)


def _observation(
    claim: Claim, result: UrlCheck
) -> Observation:
    """What the server said about this URL. No verdict — see `pv.adjudicate`."""
    if result.verdict is Verdict.UNVERIFIABLE:
        return Observation(
            claim_id=claim.content_hash,
            checker=CHECKER_NAME,
            checker_version=CHECKER_VERSION,
            status="insufficient_data",
            measured={"url": result.url, "http_status": result.status},
            provenance=[claim.anchor],
            reason=result.reason,
            detail=result.detail,
        )
    return Observation(
        claim_id=claim.content_hash,
        checker=CHECKER_NAME,
        checker_version=CHECKER_VERSION,
        status="ok",
        measured={
            "outcome": "confirmed_absent" if result.verdict is Verdict.DIVERGES else "present",
            "url": result.url,
            "http_status": result.status,
            "final_url": result.final_url,
            "detail": result.detail,
        },
        provenance=[claim.anchor],
        detail=result.detail,
    )


# --------------------------------------------------------------------------
# Check entry point
# --------------------------------------------------------------------------


async def observe_claims(
    claims: Sequence[Claim], client: HttpClient
) -> list[tuple[Observation, UrlCheck]]:
    """Request each distinct URL once and attach the answer to every claim of it."""
    urls = [
        ExtractedUrl(
            url=_url_of(claim),
            raw=str(claim.normalized.get("raw") or _url_of(claim)),
            source=str(claim.normalized.get("source") or "bare"),
            char_start=claim.anchor.char_start or 0,
            char_end=claim.anchor.char_end or 0,
            locator=claim.locator,
        )
        for claim in claims
    ]
    results = await check_urls(client, urls)
    by_url = {result.url: result for result in results}

    # Grouped by URL, as the requests were, so a paper with several dead links
    # reports them one URL at a time rather than interleaved.
    out: list[tuple[Observation, UrlCheck]] = []
    for result in results:
        for claim in claims:
            if by_url.get(_url_of(claim)) is result:
                out.append((_observation(claim, result), result))
    return out


async def run_async(ctx: CheckContext, client: HttpClient) -> CheckResult:
    started = datetime.now(timezone.utc)
    claims = claims_for(ctx)
    if not claims:
        return _result(Verdict.NOT_ATTEMPTED, started, findings=[], reason=None)

    pairs = await observe_claims(claims, client)
    observations = [observation for observation, _ in pairs]
    judgements = judge_all(observations)
    findings = list(_findings(pairs, judgements))

    if any(j.verdict is Verdict.DIVERGES for j in judgements):
        verdict, reason = Verdict.DIVERGES, None
    elif any(j.verdict is Verdict.UNVERIFIABLE for j in judgements):
        verdict = Verdict.UNVERIFIABLE
        reason = (ReasonCode.RATE_LIMITED
                  if all(j.reason is ReasonCode.RATE_LIMITED
                         for j in judgements if j.verdict is Verdict.UNVERIFIABLE)
                  else ReasonCode.NETWORK_ERROR)
    else:
        verdict, reason = Verdict.MATCHES, None

    return _result(
        verdict,
        started,
        findings=findings,
        reason=reason,
        claim_ids=[observation.claim_id for observation in observations],
    )


def observe(claim: Claim, ctx: CheckContext) -> Observation:
    """The single-claim entry point of the checker protocol (§14.3)."""

    async def _go() -> Observation:
        client = get_http_client()
        try:
            return (await observe_claims([claim], client))[0][0]
        finally:
            await client.aclose()

    if not applies(claim, ctx):
        return Observation(
            claim_id=claim.content_hash,
            checker=CHECKER_NAME,
            checker_version=CHECKER_VERSION,
            status="not_applicable",
            provenance=[claim.anchor],
        )
    return run_sync(_go())


def _findings(
    pairs: Iterable[tuple[Observation, UrlCheck]], judgements: Sequence[Judgement]
) -> Iterable[Finding]:
    for (observation, result), judgement in zip(pairs, judgements):
        if judgement.verdict is not Verdict.DIVERGES:
            continue
        locator = observation.provenance[0].human_locator
        yield Finding(
            severity=Severity.LOW,
            claimed=result.url,
            computed=result.detail,
            anchor=observation.provenance[0],
            explanation=(
                f"The server returned {result.detail} for this link"
                + (f" ({locator})." if locator and locator != "in the body" else ".")
            ),
        )


def _result(verdict: Verdict, started: datetime, *, findings: list[Finding],
            reason: ReasonCode | None, claim_ids: Sequence[str] = ()) -> CheckResult:
    now = datetime.now(timezone.utc)
    # This check reads no tolerance entry, but the policy version still identifies
    # the judgement: `POLICY_KEYS` is empty today and a later revision could add
    # one, and a stored result has to say which policy it was decided under.
    policy_version = default_policy().version
    return CheckResult(
        checker=CHECKER_NAME,
        checker_version=CHECKER_VERSION,
        policy_version=policy_version,
        fingerprint=result_fingerprint(
            claim_ids, CHECKER_NAME, CHECKER_VERSION, policy_version
        ),
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
