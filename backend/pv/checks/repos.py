"""Candidate code repositories found in the paper — the input to §5.2.

This is not a check and deliberately exposes no `run(ctx)`: it proposes, the user
confirms. Nothing here produces a verdict.

The output is `models.Artifact`. Everything used to rank a candidate — how often it
appears, whether it sits next to a code-availability phrase, whether it is only in
the bibliography — lives on the internal `RepoMention` and never reaches the
contract, because none of it is something the UI shows.

For each artifact we record `found_at`, the place in the paper the link appeared
(`§4.1, footnote 3`), and a confidence score so one row can be preselected.

GitHub metadata is a courtesy, not a requirement: without `GITHUB_TOKEN` the API
allows 60 requests an hour, so a failed lookup leaves the candidate in place with
`lookup_error` set rather than dropping it.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from urllib.parse import quote

from ..adapters.http import HttpClient, get_http_client, run_sync
from ..models import Anchor, Artifact, SourceDocument
from .links import ExtractedUrl, extract_urls, mask_comments

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


@dataclass
class RepoMention:
    """Internal: one repository and every place the paper points at it.

    The ranking signals are here rather than on `Artifact` because they are inputs
    to a heuristic, not facts about the repository.
    """

    url: str
    kind: str  # github | gitlab | other
    owner: str
    name: str
    path: str
    first: ExtractedUrl
    occurrences: int = 0
    in_abstract: bool = False
    in_footnote: bool = False
    near_availability_phrase: bool = False
    in_bibliography: bool = False
    is_deep_link: bool = True
    locators: list[str] = field(default_factory=list)

    @property
    def found_at(self) -> str:
        if self.locators:
            return self.locators[0]
        return "abstract" if self.in_abstract else "in the body"

    def to_artifact(self) -> Artifact:
        return Artifact(
            kind=self.kind,  # type: ignore[arg-type]
            url=self.url,
            path=self.path,
            found_at=self.found_at,
            anchor=Anchor(
                kind="link",
                dom_id=f"repo/{self.path}",
                char_start=self.first.char_start,
                char_end=self.first.char_end,
                human_locator=self.found_at,
            ),
            confidence=score_mention(self),
        )


def parse_repo_url(url: str) -> tuple[str, str, str, bool] | None:
    """(kind, owner, name, is_deep_link) for a repository URL, else None."""
    match = re.match(r"^https?://(?:www\.)?(github\.com|gitlab\.com)/([^/?#]+)/([^/?#]+)(/[^?#]*)?", url)
    if not match:
        return None
    kind = "github" if "github" in match.group(1) else "gitlab"
    owner = match.group(2)
    name = re.sub(r"\.git$", "", match.group(3))
    if owner.lower() in _RESERVED or not name:
        return None
    trailing = (match.group(4) or "").strip("/")
    return kind, owner, name, bool(trailing)


def find_repository_mentions(document: SourceDocument) -> list[RepoMention]:
    """Offline: every GitHub/GitLab repository the source points at, with its signals."""
    latex = document.assembled_latex
    masked = mask_comments(latex)
    bibliography_start = _bibliography_start(masked)

    mentions: dict[str, RepoMention] = {}
    for item in extract_urls(latex):
        parsed = parse_repo_url(item.url)
        if parsed is None:
            continue
        kind, owner, name, deep = parsed
        path = f"{owner}/{name}"
        mention = mentions.get(path)
        if mention is None:
            host = "github.com" if kind == "github" else "gitlab.com"
            mention = RepoMention(url=f"https://{host}/{path}", kind=kind, owner=owner,
                                  name=name, path=path, first=item)
            mentions[path] = mention

        mention.occurrences += 1
        # A repository linked anywhere at its root is not a deep link.
        mention.is_deep_link = mention.is_deep_link and deep
        if item.locator and item.locator not in mention.locators:
            mention.locators.append(item.locator)
        if "footnote" in item.locator:
            mention.in_footnote = True
        if _in_abstract(masked, item.char_start):
            mention.in_abstract = True
        if _near_availability_phrase(masked, item):
            mention.near_availability_phrase = True
        if bibliography_start >= 0 and item.char_start > bibliography_start:
            mention.in_bibliography = True

    return sorted(mentions.values(), key=lambda m: (-score_mention(m), m.path))


def find_repository_candidates(document: SourceDocument) -> list[Artifact]:
    """Offline: §5.2 candidates, best first, without any metadata lookup."""
    return [mention.to_artifact() for mention in find_repository_mentions(document)]


def score_mention(mention: RepoMention) -> float:
    """Heuristic and deterministic. Ranking only — it never decides anything."""
    score = 0.30
    if mention.near_availability_phrase:
        score += 0.30
    if mention.in_abstract or mention.in_footnote:
        score += 0.15
    if not mention.is_deep_link:
        score += 0.10
    score += min(0.10, 0.05 * (mention.occurrences - 1))
    if mention.in_bibliography:
        score -= 0.30
    if mention.is_deep_link:
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


async def fetch_metadata(client: HttpClient, artifact: Artifact) -> Artifact:
    """Attach stars and last-commit date. Any failure sets `lookup_error` and
    leaves the artifact in the list — the UI simply shows no stars."""
    if artifact.kind == "github":
        resp = await client.get(f"{GITHUB_API}/repos/{artifact.path}", headers=_github_headers())
        body = resp.json() if resp.ok else None
        if resp.failed:
            artifact.lookup_error = f"{(resp.error_kind.value if resp.error_kind else 'error')}: {resp.error_detail}"
        elif resp.status == 404:
            artifact.lookup_error = "GitHub returned 404 — the repository is private or does not exist"
        elif resp.status == 403:
            artifact.lookup_error = "GitHub rate limit reached — set GITHUB_TOKEN for 5,000 requests an hour"
        elif isinstance(body, dict):
            artifact.stars = body.get("stargazers_count")
            artifact.last_commit = _parse_time(body.get("pushed_at"))
        else:
            artifact.lookup_error = f"unexpected GitHub response (HTTP {resp.status})"
        return artifact

    if artifact.kind == "gitlab":
        resp = await client.get(f"{GITLAB_API}/projects/{quote(artifact.path, safe='')}")
        body = resp.json() if resp.ok else None
        if resp.failed:
            artifact.lookup_error = f"{(resp.error_kind.value if resp.error_kind else 'error')}: {resp.error_detail}"
        elif isinstance(body, dict):
            artifact.stars = body.get("star_count")
            artifact.last_commit = _parse_time(body.get("last_activity_at"))
        else:
            artifact.lookup_error = f"GitLab returned HTTP {resp.status}"
    return artifact


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def find_repositories(document: SourceDocument, client: HttpClient | None = None) -> list[Artifact]:
    """§5.2 candidates with metadata attached, best first."""
    artifacts = find_repository_candidates(document)
    if not artifacts:
        return []
    owned = client is None
    client = client or get_http_client()
    try:
        for artifact in artifacts:
            await fetch_metadata(client, artifact)
    finally:
        if owned:
            await client.aclose()
    return artifacts


def find_repositories_sync(document: SourceDocument) -> list[Artifact]:
    return run_sync(find_repositories(document))
