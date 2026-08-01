"""Candidate code repositories found in the paper — the input to §5.2.

This is not a check and deliberately exposes no `run(ctx)`: it proposes, the user
confirms. Nothing here produces a verdict.

For each candidate we record where in the paper the link appeared (`§4.1, footnote 3`),
because that is what makes the confirmation screen possible to reason about, and a
confidence score so one row can be preselected.

GitHub metadata is a courtesy, not a requirement: without `GITHUB_TOKEN` the API
allows 60 requests an hour, so a failed lookup leaves the candidate in place with
`lookup_error` set rather than dropping it.
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from urllib.parse import quote

from pydantic import BaseModel, Field

from ..adapters.http import HttpClient, get_http_client, run_sync
from ..models import SourceDocument
from .links import ExtractedUrl, describe_location, extract_urls, mask_comments

GITHUB_API = "https://api.github.com"
GITLAB_API = "https://gitlab.com/api/v4"

# Paths that are part of the site, never a project.
_RESERVED = frozenset({
    "features", "pricing", "about", "login", "join", "explore", "topics", "collections",
    "trending", "marketplace", "sponsors", "orgs", "settings", "notifications", "search",
    "apps", "blog", "help", "site", "users", "-", "dashboard", "public", "groups",
})

# Phrases an author uses when handing over their own code.
_AVAILABILITY = re.compile(
    r"(code|implementation|source|models?|weights|checkpoints?|scripts?)[^.\n]{0,60}"
    r"(available|released?|can be found|is at|are at|open[- ]source|we release|"
    r"github|repository|repo)|"
    r"(available at|released at|we release|our code|the code we used|"
    r"code is available|code available)",
    re.IGNORECASE,
)


class RepoCandidate(BaseModel):
    """One repository link found in the paper, with provenance and metadata.

    The contract (`models.py`) has no artifact model yet; §10 names an `artifacts`
    table. When that lands this should collapse into it.
    """

    url: str
    host: str  # github | gitlab | other
    owner: str = ""
    name: str = ""
    full_name: str = ""
    # Where it appeared, e.g. "§4.1, footnote 3" — shown verbatim in §5.2.
    locator: str = ""
    occurrences: int = 1
    in_abstract: bool = False
    in_footnote: bool = False
    near_availability_phrase: bool = False
    in_bibliography: bool = False
    is_deep_link: bool = False
    confidence: float = 0.0
    stars: int | None = None
    last_commit: datetime | None = None
    default_branch: str = ""
    archived: bool | None = None
    description: str = ""
    # Set when metadata could not be fetched. The candidate still stands.
    lookup_error: str = ""
    all_locators: list[str] = Field(default_factory=list)


def parse_repo_url(url: str) -> tuple[str, str, str, bool] | None:
    """(host, owner, name, is_deep_link) for a repository URL, else None."""
    match = re.match(r"^https?://(?:www\.)?(github\.com|gitlab\.com)/([^/?#]+)/([^/?#]+)(/[^?#]*)?", url)
    if not match:
        return None
    host = "github" if "github" in match.group(1) else "gitlab"
    owner = match.group(2)
    name = re.sub(r"\.git$", "", match.group(3))
    if owner.lower() in _RESERVED or not name:
        return None
    trailing = (match.group(4) or "").strip("/")
    return host, owner, name, bool(trailing)


def find_repository_candidates(document: SourceDocument) -> list[RepoCandidate]:
    """Offline: scan the source for GitHub/GitLab links and score them."""
    latex = document.assembled_latex
    masked = mask_comments(latex)
    bibliography_start = _bibliography_start(masked)

    by_repo: dict[str, RepoCandidate] = {}
    for item in extract_urls(latex):
        parsed = parse_repo_url(item.url)
        if parsed is None:
            continue
        host, owner, name, deep = parsed
        full_name = f"{owner}/{name}"
        candidate = by_repo.get(full_name)
        if candidate is None:
            candidate = RepoCandidate(
                url=f"https://{'github.com' if host == 'github' else 'gitlab.com'}/{full_name}",
                host=host, owner=owner, name=name, full_name=full_name,
                locator=item.locator, occurrences=0, is_deep_link=deep,
            )
            by_repo[full_name] = candidate

        candidate.occurrences += 1
        candidate.is_deep_link = candidate.is_deep_link and deep
        if item.locator and item.locator not in candidate.all_locators:
            candidate.all_locators.append(item.locator)
        if not candidate.locator:
            candidate.locator = item.locator
        if "footnote" in item.locator:
            candidate.in_footnote = True
        if _in_abstract(masked, item.char_start):
            candidate.in_abstract = True
        if _near_availability_phrase(masked, item):
            candidate.near_availability_phrase = True
        if bibliography_start >= 0 and item.char_start > bibliography_start:
            candidate.in_bibliography = True

    for candidate in by_repo.values():
        if not candidate.locator:
            candidate.locator = "abstract" if candidate.in_abstract else "in the body"
        candidate.confidence = score_candidate(candidate)

    return sorted(by_repo.values(), key=lambda c: (-c.confidence, c.full_name))


def score_candidate(candidate: RepoCandidate) -> float:
    """Heuristic and deterministic. Ranking only — it never decides anything."""
    score = 0.30
    if candidate.near_availability_phrase:
        score += 0.30
    if candidate.in_abstract or candidate.in_footnote:
        score += 0.15
    if not candidate.is_deep_link:
        score += 0.10
    score += min(0.10, 0.05 * (candidate.occurrences - 1))
    if candidate.in_bibliography:
        score -= 0.30
    if candidate.is_deep_link:
        score -= 0.15
    return round(max(0.0, min(1.0, score)), 2)


def _in_abstract(masked: str, pos: int) -> bool:
    begin = masked.rfind("\\begin{abstract}", 0, pos)
    if begin < 0:
        return False
    end = masked.find("\\end{abstract}", begin)
    return end < 0 or end > pos


def _bibliography_start(masked: str) -> int:
    for marker in ("\\begin{thebibliography}", "\\bibliography{"):
        index = masked.find(marker)
        if index >= 0:
            return index
    return -1


def _near_availability_phrase(masked: str, item: ExtractedUrl) -> bool:
    window = masked[max(0, item.char_start - 240) : item.char_start + 80]
    return bool(_AVAILABILITY.search(window))


# --------------------------------------------------------------------------
# Metadata
# --------------------------------------------------------------------------


def _github_headers() -> dict[str, str]:
    token = os.getenv("GITHUB_TOKEN", "").strip()
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def fetch_metadata(client: HttpClient, candidate: RepoCandidate) -> RepoCandidate:
    if candidate.host == "github":
        resp = await client.get(f"{GITHUB_API}/repos/{candidate.full_name}", headers=_github_headers())
        body = resp.json() if resp.ok else None
        if resp.failed:
            candidate.lookup_error = f"{(resp.error_kind.value if resp.error_kind else 'error')}: {resp.error_detail}"
        elif resp.status == 404:
            candidate.lookup_error = "GitHub returned 404 — the repository is private or does not exist"
        elif resp.status == 403:
            candidate.lookup_error = "GitHub rate limit reached — set GITHUB_TOKEN for 5,000 requests an hour"
        elif isinstance(body, dict):
            candidate.stars = body.get("stargazers_count")
            candidate.last_commit = _parse_time(body.get("pushed_at"))
            candidate.default_branch = body.get("default_branch") or ""
            candidate.archived = body.get("archived")
            candidate.description = body.get("description") or ""
        else:
            candidate.lookup_error = f"unexpected GitHub response (HTTP {resp.status})"
        return candidate

    if candidate.host == "gitlab":
        path = quote(candidate.full_name, safe="")
        resp = await client.get(f"{GITLAB_API}/projects/{path}")
        body = resp.json() if resp.ok else None
        if resp.failed:
            candidate.lookup_error = f"{(resp.error_kind.value if resp.error_kind else 'error')}: {resp.error_detail}"
        elif isinstance(body, dict):
            candidate.stars = body.get("star_count")
            candidate.last_commit = _parse_time(body.get("last_activity_at"))
            candidate.default_branch = body.get("default_branch") or ""
            candidate.archived = body.get("archived")
            candidate.description = body.get("description") or ""
        else:
            candidate.lookup_error = f"GitLab returned HTTP {resp.status}"
    return candidate


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def find_repositories(document: SourceDocument, client: HttpClient | None = None) -> list[RepoCandidate]:
    """Candidates with metadata attached, best first."""
    candidates = find_repository_candidates(document)
    if not candidates:
        return []
    owned = client is None
    client = client or get_http_client()
    try:
        for candidate in candidates:
            await fetch_metadata(client, candidate)
    finally:
        if owned:
            await client.aclose()
    return candidates


def find_repositories_sync(document: SourceDocument) -> list[RepoCandidate]:
    return run_sync(find_repositories(document))
