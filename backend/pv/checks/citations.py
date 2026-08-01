"""Check 6 — citation existence and retraction status.

The asymmetry here is the whole design. Crossref and OpenAlex between them index a
large fraction of the literature, but far from all of it: workshop papers, theses,
tech reports and arXiv-only preprints are routinely absent from both. So:

  - A reference confirmed **retracted** by an index is a finding.
  - A reference **not found** is `unverifiable`. It is never a finding. Publishing
    "this citation does not exist" about a real workshop paper is precisely the
    false accusation this product must not make.

No model is involved. Titles are matched by token containment, and a match below
the threshold is treated as no match.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

from ..adapters.http import HttpClient, contact_email, get_http_client, run_sync
from ..models import Anchor, CheckContext, CheckResult, Finding, ReasonCode, Severity, Verdict

CHECKER_NAME = "citation_existence"
CHECKER_VERSION = "1.0.0"
DISPLAY_NAME = "Citation existence"
DESCRIPTION = "Looks up each reference in Crossref and OpenAlex and reports confirmed retractions."

CROSSREF_BASE = "https://api.crossref.org"
OPENALEX_BASE = "https://api.openalex.org"

# Title agreement, as a symmetric Dice coefficient over content tokens. It has to
# be symmetric: "Attention is all you need" is wholly contained in "Is Space-Time
# Attention All You Need for Video Understanding?", which is a different paper.
TITLE_MATCH_THRESHOLD = 0.8

# A retraction attributed to the wrong work is the worst output this product can
# produce, so reporting one needs either a DOI match or a near-exact title.
STRICT_RETRACTION_TITLE_SCORE = 0.95

# Absence from both indexes is the most common citation outcome and says nothing
# about the reference. It has its own reason code so §5.5 can say exactly that.
REASON_NOT_INDEXED: ReasonCode | None = ReasonCode.REFERENCE_NOT_INDEXED

_DOI = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.IGNORECASE)
_ARXIV = re.compile(r"(?:arXiv[:\s]*|abs/)(\d{4}\.\d{4,5})(v\d+)?", re.IGNORECASE)
_YEAR = re.compile(r"\b(19|20)\d{2}\b")
_STOPWORDS = frozenset({"a", "an", "the", "of", "for", "and", "with", "on", "in", "to", "is", "are", "via"})


# --------------------------------------------------------------------------
# Bibliography parsing
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Reference:
    key: str
    raw: str
    title: str = ""
    doi: str = ""
    arxiv_id: str = ""
    year: str = ""
    char_start: int = 0

    def anchor(self) -> Anchor:
        return Anchor(
            kind="reference",
            dom_id=f"ref/{self.key}",
            char_start=self.char_start,
            char_end=self.char_start + len(self.raw),
            human_locator=f"reference [{self.key}]",
        )


def clean_latex_text(text: str) -> str:
    """Strip the markup that surrounds a title in a bibliography entry."""
    text = re.sub(r"%.*", "", text)
    text = text.replace("\\newblock", " ").replace("~", " ")
    text = re.sub(r"\\(?:em|it|bf|rm|sc|tt)\b", " ", text)
    text = re.sub(r"\\[a-zA-Z]+\s*\*?", " ", text)
    text = re.sub(r"[{}$\\]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .,")


def parse_bibliography(latex: str) -> list[Reference]:
    """`\\bibitem` entries plus any `.bib`/`.bbl` content inlined in the source."""
    refs = list(_parse_bibitems(latex))
    seen = {r.key for r in refs}
    for ref in _parse_bibtex(latex):
        if ref.key not in seen:
            refs.append(ref)
            seen.add(ref.key)
    return refs


def _parse_bibitems(latex: str) -> Iterable[Reference]:
    starts = [m for m in re.finditer(r"\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}", latex)]
    for index, match in enumerate(starts):
        body_start = match.end()
        if index + 1 < len(starts):
            body_end = starts[index + 1].start()
        else:
            stop = latex.find("\\end{thebibliography}", body_start)
            body_end = stop if stop > 0 else len(latex)
        body = latex[body_start:body_end]
        yield _reference_from_bibitem(match.group(1).strip(), body, match.start())


def _reference_from_bibitem(key: str, body: str, char_start: int) -> Reference:
    # `\newblock` separates author / title / venue in every standard bst style.
    blocks = [clean_latex_text(b) for b in body.split("\\newblock")]
    blocks = [b for b in blocks if b]
    title = blocks[1] if len(blocks) >= 2 else (blocks[0] if blocks else "")
    if len(blocks) == 1:
        # No \newblock: fall back to the sentence after the author list.
        sentences = [s.strip() for s in re.split(r"(?<=[a-z0-9])\.\s+", blocks[0]) if s.strip()]
        title = sentences[1] if len(sentences) >= 2 else sentences[0] if sentences else ""
    flat = clean_latex_text(body)
    doi_match = _DOI.search(body)
    arxiv_match = _ARXIV.search(body)
    year_match = _YEAR.search(flat)
    return Reference(
        key=key,
        raw=body.strip(),
        title=title,
        doi=doi_match.group(0).rstrip(".,;") if doi_match else "",
        arxiv_id=arxiv_match.group(1) if arxiv_match else "",
        year=year_match.group(0) if year_match else "",
        char_start=char_start,
    )


def _parse_bibtex(latex: str) -> Iterable[Reference]:
    for match in re.finditer(r"@(\w+)\s*\{\s*([^,\s]+)\s*,", latex):
        entry_type = match.group(1).lower()
        if entry_type in ("comment", "string", "preamble"):
            continue
        body = _bibtex_body(latex, match.end())
        fields = dict(re.findall(r"(\w+)\s*=\s*[{\"]([^{}\"]*(?:\{[^{}]*\}[^{}\"]*)*)[}\"]", body))
        lowered = {k.lower(): v for k, v in fields.items()}
        doi = lowered.get("doi", "")
        if not doi:
            doi_match = _DOI.search(body)
            doi = doi_match.group(0).rstrip(".,;") if doi_match else ""
        arxiv_match = _ARXIV.search(body)
        yield Reference(
            key=match.group(2),
            raw=body.strip(),
            title=clean_latex_text(lowered.get("title", "")),
            doi=doi.strip(),
            arxiv_id=lowered.get("eprint", "") or (arxiv_match.group(1) if arxiv_match else ""),
            year=lowered.get("year", ""),
            char_start=match.start(),
        )


def _bibtex_body(latex: str, start: int) -> str:
    depth = 1
    i, n = start, len(latex)
    while i < n and depth:
        if latex[i] == "{":
            depth += 1
        elif latex[i] == "}":
            depth -= 1
        i += 1
    return latex[start : i - 1]


# --------------------------------------------------------------------------
# Index lookups
# --------------------------------------------------------------------------


@dataclass
class ReferenceLookup:
    reference: Reference
    found_in: list[str] = field(default_factory=list)
    matched_title: str = ""
    matched_doi: str = ""
    # doi | title — how we decided this record is the cited work.
    match_basis: str = ""
    title_score: float = 0.0
    retracted: bool = False
    retraction_detail: str = ""
    network_error: str = ""

    @property
    def found(self) -> bool:
        return bool(self.found_in)

    @property
    def retraction_is_reportable(self) -> bool:
        """A retraction is only ours to report if we are sure which work it is about."""
        if not self.retracted:
            return False
        return self.match_basis == "doi" or self.title_score >= STRICT_RETRACTION_TITLE_SCORE


def _tokens(title: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", title.lower()) if t not in _STOPWORDS]


def title_similarity(left: str, right: str) -> float:
    """Dice coefficient over content tokens. Symmetric, so a longer candidate title
    that merely contains the reference's title does not count as a match — see
    "Attention is all you need" against "Is Space-Time Attention All You Need for
    Video Understanding?", which containment alone accepts."""
    a, b = set(_tokens(left)), set(_tokens(right))
    if len(a) < 2 or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


def titles_match(left: str, right: str, threshold: float = TITLE_MATCH_THRESHOLD) -> bool:
    return title_similarity(left, right) >= threshold


def _years_agree(ref_year: str, work_year: object) -> bool:
    """Unknown on either side is not disagreement. Two years apart is."""
    if not ref_year or work_year in (None, ""):
        return True
    try:
        return abs(int(ref_year) - int(work_year)) <= 1
    except (TypeError, ValueError):
        return True


@dataclass
class Match:
    """One index's answer: the record, how we matched it, and how well."""

    work: dict[str, Any] | None = None
    basis: str = ""
    score: float = 0.0
    error: str = ""


def _crossref_year(work: dict[str, Any]) -> object:
    for key in ("issued", "published-print", "published-online", "created"):
        parts = (work.get(key) or {}).get("date-parts") or []
        if parts and parts[0]:
            return parts[0][0]
    return None


async def lookup_crossref(client: HttpClient, ref: Reference) -> Match:
    params = {"mailto": contact_email()}
    if ref.doi:
        resp = await client.get(f"{CROSSREF_BASE}/works/{ref.doi}", params=params)
        if resp.failed:
            return Match(error=resp.error_detail)
        body = resp.json() if resp.ok else None
        if isinstance(body, dict) and isinstance(body.get("message"), dict):
            return Match(work=body["message"], basis="doi", score=1.0)
        return Match()

    if not ref.title:
        return Match()
    resp = await client.get(
        f"{CROSSREF_BASE}/works",
        params={**params, "query.bibliographic": ref.title, "rows": 3},
    )
    if resp.failed:
        return Match(error=resp.error_detail)
    body = resp.json() if resp.ok else None
    items = (body or {}).get("message", {}).get("items", []) if isinstance(body, dict) else []
    best = Match()
    for item in items:
        if not _years_agree(ref.year, _crossref_year(item)):
            continue
        for candidate in item.get("title") or []:
            score = title_similarity(ref.title, candidate)
            if score >= TITLE_MATCH_THRESHOLD and score > best.score:
                best = Match(work=item, basis="title", score=score)
    return best


async def lookup_openalex(client: HttpClient, ref: Reference) -> Match:
    params = {"mailto": contact_email()}
    if ref.doi:
        resp = await client.get(f"{OPENALEX_BASE}/works/doi:{ref.doi}", params=params)
        if resp.failed:
            return Match(error=resp.error_detail)
        body = resp.json() if resp.ok else None
        if isinstance(body, dict) and body.get("id"):
            return Match(work=body, basis="doi", score=1.0)
        return Match()

    if not ref.title:
        return Match()
    # OpenAlex rejects some punctuation in title.search; content tokens are enough.
    query = " ".join(_tokens(ref.title)[:12])
    if not query:
        return Match()
    resp = await client.get(
        f"{OPENALEX_BASE}/works",
        params={**params, "filter": f"title.search:{query}", "per-page": 3},
    )
    if resp.failed:
        return Match(error=resp.error_detail)
    body = resp.json() if resp.ok else None
    best = Match()
    for item in (body or {}).get("results", []) if isinstance(body, dict) else []:
        if not _years_agree(ref.year, item.get("publication_year")):
            continue
        score = title_similarity(ref.title, item.get("title") or item.get("display_name") or "")
        if score >= TITLE_MATCH_THRESHOLD and score > best.score:
            best = Match(work=item, basis="title", score=score)
    return best


def crossref_retraction(work: dict[str, Any]) -> str:
    """Crossref marks a retracted work by pointing at the notice that retracted it."""
    for update in work.get("updated-by") or []:
        label = str(update.get("type", "")).lower()
        if any(word in label for word in ("retract", "withdraw", "removal")):
            doi = update.get("DOI", "")
            return f"Crossref records a {label} notice{f' ({doi})' if doi else ''}"
    if str(work.get("type", "")).lower() == "retraction":
        return "Crossref classifies this record itself as a retraction notice"
    return ""


def openalex_retraction(work: dict[str, Any]) -> str:
    if work.get("is_retracted") is True:
        return "OpenAlex flags this work as retracted"
    return ""


async def lookup_reference(client: HttpClient, ref: Reference) -> ReferenceLookup:
    result = ReferenceLookup(reference=ref)

    crossref = await lookup_crossref(client, ref)
    if crossref.error:
        result.network_error = crossref.error
    if crossref.work:
        result.found_in.append("crossref")
        result.match_basis = crossref.basis
        result.title_score = crossref.score
        result.matched_doi = str(crossref.work.get("DOI", "") or "")
        titles = crossref.work.get("title") or []
        result.matched_title = titles[0] if titles else ""
        detail = crossref_retraction(crossref.work)
        if detail:
            result.retracted, result.retraction_detail = True, detail

    openalex = await lookup_openalex(client, ref)
    if openalex.error and not result.network_error:
        result.network_error = openalex.error
    if openalex.work:
        result.found_in.append("openalex")
        if openalex.basis == "doi" or openalex.score > result.title_score:
            result.match_basis = result.match_basis or openalex.basis
            result.title_score = max(result.title_score, openalex.score)
        if openalex.basis == "doi":
            result.match_basis = "doi"
        result.matched_title = result.matched_title or str(
            openalex.work.get("title") or openalex.work.get("display_name") or ""
        )
        result.matched_doi = result.matched_doi or str(openalex.work.get("doi") or "")
        detail = openalex_retraction(openalex.work)
        if detail:
            result.retracted = True
            result.retraction_detail = "; ".join(filter(None, [result.retraction_detail, detail]))

    return result


async def lookup_references(client: HttpClient, refs: Sequence[Reference]) -> list[ReferenceLookup]:
    return [await lookup_reference(client, ref) for ref in refs]


# --------------------------------------------------------------------------
# Check entry point
# --------------------------------------------------------------------------


async def run_async(ctx: CheckContext, client: HttpClient) -> CheckResult:
    started = datetime.now(timezone.utc)
    refs = parse_bibliography(ctx.document.assembled_latex)
    if not refs:
        return _result(Verdict.NOT_ATTEMPTED, started, [], None)

    lookups = await lookup_references(client, refs)
    findings = [
        Finding(
            severity=Severity.HIGH,
            claimed=f"[{item.reference.key}] {item.reference.title}".strip(),
            computed=item.retraction_detail,
            anchor=item.reference.anchor(),
            explanation=(
                f"This reference is cited as current, but {item.retraction_detail.lower()}."
            ),
        )
        for item in lookups
        if item.retraction_is_reportable
    ]

    if findings:
        return _result(Verdict.DIVERGES, started, findings, None)

    # A retraction we could not tie to the cited work with confidence is a reason to
    # say nothing, not a reason to name someone.
    unattributed = [item for item in lookups if item.retracted]
    unresolved = [item for item in lookups if not item.found]
    if not unresolved and not unattributed:
        return _result(Verdict.MATCHES, started, [], None)

    network = any(item.network_error for item in lookups)
    reason = ReasonCode.NETWORK_ERROR if network else REASON_NOT_INDEXED
    return _result(Verdict.UNVERIFIABLE, started, [], reason)


def _result(verdict: Verdict, started: datetime, findings: list[Finding],
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
