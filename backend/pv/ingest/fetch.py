"""Fetch arXiv e-print source, politely and exactly once.

arXiv etiquette is not negotiable (CLAUDE.md): one request per three seconds, a
single connection, a real User-Agent carrying CONTACT_EMAIL, and every payload
cached under `.arxivcache/<id>/`. A cached paper is never re-fetched — not on a
later run, not on a later day.

The payload varies by paper:
  - gzipped tar (most papers, multi-file sources)
  - a bare gzipped `.tex` (single-file submissions)
  - a PDF, when the author submitted no source at all

The last case is not an error. It returns a `FetchResult` carrying
`ReasonCode.NO_LATEX_SOURCE`, which the run reports in the "not checked"
section.
"""

from __future__ import annotations

import gzip
import io
import json
import os
import re
import tarfile
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from pv.models import ReasonCode

ARXIV_SOURCE_URL = "https://arxiv.org/e-print/{arxiv_id}"
MIN_REQUEST_INTERVAL_S = 3.0
DEFAULT_CACHE_DIR = Path(".arxivcache")
DEFAULT_TIMEOUT_S = 60.0

# Files worth keeping out of a tarball. Everything else (figures, .bbl blobs)
# is ignored: we only ever parse text.
_TEXT_SUFFIXES = {".tex", ".ltx", ".sty", ".cls", ".bib", ".bbl", ".clo", ".tikz"}
_MAX_MEMBER_BYTES = 32 * 1024 * 1024

_ARXIV_ID_RE = re.compile(r"^(?:arxiv:)?(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(v\d+)?$", re.I)


@dataclass
class FetchResult:
    """What ingest got back from arXiv (or from the cache)."""

    arxiv_id: str
    version: str | None = None
    # relative file name -> text content
    files: dict[str, str] = field(default_factory=dict)
    reason: ReasonCode | None = None
    detail: str = ""
    from_cache: bool = False
    fetched_at: datetime | None = None
    cache_dir: Path | None = None

    @property
    def ok(self) -> bool:
        return self.reason is None and bool(self.files)


class _RateLimiter:
    """One request per `interval` seconds, across threads and across processes.

    The last-request timestamp lives in the cache directory so that a second
    `python -m pv.ingest.cli` a second later still waits.
    """

    def __init__(self, interval: float = MIN_REQUEST_INTERVAL_S) -> None:
        self.interval = interval
        self._lock = threading.Lock()
        self._last = 0.0

    def wait(self, stamp_path: Path | None = None) -> None:
        with self._lock:
            last = self._last
            if stamp_path is not None and stamp_path.exists():
                try:
                    last = max(last, float(stamp_path.read_text().strip()))
                except (ValueError, OSError):
                    pass
            delay = self.interval - (time.time() - last)
            if delay > 0:
                time.sleep(delay)
            now = time.time()
            self._last = now
            if stamp_path is not None:
                try:
                    stamp_path.parent.mkdir(parents=True, exist_ok=True)
                    stamp_path.write_text(str(now))
                except OSError:
                    pass


_LIMITER = _RateLimiter()


def normalize_arxiv_id(raw: str) -> tuple[str, str | None]:
    """Split `1706.03762v5` into ("1706.03762", "v5"). Raises on nonsense."""
    raw = raw.strip()
    raw = re.sub(r"^https?://arxiv\.org/(abs|pdf|e-print)/", "", raw, flags=re.I)
    raw = re.sub(r"\.pdf$", "", raw, flags=re.I)
    m = _ARXIV_ID_RE.match(raw)
    if m is None:
        raise ValueError(f"not an arXiv id: {raw!r}")
    return m.group(1), (m.group(2) or None)


def user_agent() -> str:
    contact = os.environ.get("CONTACT_EMAIL", "").strip()
    base = "paper-verify/0.1 (https://github.com/paper-verify)"
    return f"{base}; mailto:{contact}" if contact else base


def cache_key(arxiv_id: str, version: str | None) -> str:
    return f"{arxiv_id}{version or ''}".replace("/", "_")


def fetch_source(
    arxiv_id: str,
    *,
    cache_dir: str | Path = DEFAULT_CACHE_DIR,
    allow_network: bool = True,
    timeout: float = DEFAULT_TIMEOUT_S,
) -> FetchResult:
    """Return the LaTeX source for `arxiv_id`, from cache when present.

    Set `allow_network=False` to assert that nothing may hit the network — used
    by the test suite, which must run entirely offline.
    """
    ident, version = normalize_arxiv_id(arxiv_id)
    root = Path(cache_dir) / cache_key(ident, version)

    cached = load_cached(root, ident, version)
    if cached is not None:
        return cached

    if not allow_network:
        return FetchResult(
            arxiv_id=ident,
            version=version,
            reason=ReasonCode.NETWORK_ERROR,
            detail="not cached and network access is disabled",
        )

    payload, detail = _download(ident, version, cache_dir=Path(cache_dir), timeout=timeout)
    if payload is None:
        return FetchResult(
            arxiv_id=ident,
            version=version,
            reason=ReasonCode.NETWORK_ERROR,
            detail=detail,
        )

    fetched_at = datetime.now(timezone.utc)
    files, reason, note = unpack(payload)
    result = FetchResult(
        arxiv_id=ident,
        version=version,
        files=files,
        reason=reason,
        detail=note,
        from_cache=False,
        fetched_at=fetched_at,
        cache_dir=root,
    )
    _write_cache(root, result, payload)
    return result


def load_cached(root: Path, arxiv_id: str, version: str | None) -> FetchResult | None:
    """Read a previously fetched paper. Returns None when nothing is cached."""
    meta_path = root / "meta.json"
    if not meta_path.exists():
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None

    files: dict[str, str] = {}
    src = root / "source"
    if src.is_dir():
        for path in sorted(src.rglob("*")):
            if path.is_file():
                files[path.relative_to(src).as_posix()] = _decode(path.read_bytes())

    reason = ReasonCode(meta["reason"]) if meta.get("reason") else None
    fetched_at = None
    if meta.get("fetched_at"):
        try:
            fetched_at = datetime.fromisoformat(meta["fetched_at"])
        except ValueError:
            pass
    return FetchResult(
        arxiv_id=meta.get("arxiv_id", arxiv_id),
        version=meta.get("version", version),
        files=files,
        reason=reason,
        detail=meta.get("detail", ""),
        from_cache=True,
        fetched_at=fetched_at,
        cache_dir=root,
    )


def _download(
    arxiv_id: str, version: str | None, cache_dir: Path, timeout: float
) -> tuple[bytes | None, str]:
    import httpx  # imported late so offline tests never need it

    url = ARXIV_SOURCE_URL.format(arxiv_id=f"{arxiv_id}{version or ''}")
    _LIMITER.wait(cache_dir / ".last_request")
    headers = {"User-Agent": user_agent(), "Accept": "*/*"}
    try:
        # limits: one connection, as required. follow_redirects: arXiv redirects
        # e-print URLs through a mirror host.
        with httpx.Client(
            headers=headers,
            timeout=timeout,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=1, max_keepalive_connections=1),
        ) as client:
            response = client.get(url)
    except Exception as exc:  # network failures are a verdict, not a crash
        return None, f"{type(exc).__name__}: {exc}"
    if response.status_code != 200:
        return None, f"HTTP {response.status_code} from {url}"
    return response.content, ""


def unpack(payload: bytes) -> tuple[dict[str, str], ReasonCode | None, str]:
    """Turn a downloaded e-print payload into a name -> text mapping."""
    if payload[:5] == b"%PDF-":
        return {}, ReasonCode.NO_LATEX_SOURCE, "arXiv holds a PDF only; no LaTeX source"

    raw = payload
    if payload[:2] == b"\x1f\x8b":
        try:
            raw = gzip.decompress(payload)
        except OSError as exc:
            return {}, ReasonCode.NO_LATEX_SOURCE, f"corrupt gzip payload: {exc}"

    if raw[:5] == b"%PDF-":
        return {}, ReasonCode.NO_LATEX_SOURCE, "arXiv holds a PDF only; no LaTeX source"

    if _looks_like_tar(raw):
        files = _extract_tar(raw)
        if not files:
            return {}, ReasonCode.NO_LATEX_SOURCE, "tarball contained no text source"
        return files, None, ""

    # A bare single-file submission. arXiv does not record its name; papers of
    # this shape are always one manuscript.
    text = _decode(raw)
    if "\\documentclass" not in text and "\\input" not in text:
        return {}, ReasonCode.NO_LATEX_SOURCE, "payload is not recognisable LaTeX"
    return {"main.tex": text}, None, ""


def _looks_like_tar(raw: bytes) -> bool:
    return len(raw) > 262 and raw[257:262] == b"ustar"


def is_safe_member_name(name: str) -> bool:
    """Reject anything that could escape the extraction directory.

    Tarballs are attacker-controlled input; a member named `../../.bashrc` must
    never be written.
    """
    if not name or name.startswith(("/", "\\")):
        return False
    normalized = name.replace("\\", "/")
    if re.match(r"^[A-Za-z]:", normalized):  # Windows drive letter
        return False
    parts = normalized.split("/")
    return ".." not in parts


def _extract_tar(raw: bytes) -> dict[str, str]:
    files: dict[str, str] = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:*") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            if not is_safe_member_name(member.name):
                continue
            if member.size > _MAX_MEMBER_BYTES:
                continue
            name = member.name.replace("\\", "/").lstrip("./")
            suffix = Path(name).suffix.lower()
            if suffix and suffix not in _TEXT_SUFFIXES:
                continue
            handle = tar.extractfile(member)
            if handle is None:
                continue
            data = handle.read()
            if not suffix and b"\\documentclass" not in data:
                continue  # extensionless non-manuscript
            files[name] = _decode(data)
    return files


def _decode(data: bytes) -> str:
    for encoding in ("utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _write_cache(root: Path, result: FetchResult, payload: bytes) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / "payload.bin").write_bytes(payload)
    src = root / "source"
    for name, text in result.files.items():
        if not is_safe_member_name(name):
            continue
        path = src / name
        path.parent.mkdir(parents=True, exist_ok=True)
        # Bytes, not text: on Windows `write_text` would translate every \n to
        # \r\n, and the source hash must not depend on the host OS.
        path.write_bytes(text.encode("utf-8"))
    meta = {
        "arxiv_id": result.arxiv_id,
        "version": result.version,
        "reason": result.reason.value if result.reason else None,
        "detail": result.detail,
        "fetched_at": result.fetched_at.isoformat() if result.fetched_at else None,
        "file_count": len(result.files),
    }
    (root / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")


def load_directory(path: str | Path, arxiv_id: str = "local") -> FetchResult:
    """Load an already-extracted source tree from disk. No network, ever.

    Used for the fixtures and for working offline.
    """
    root = Path(path)
    files: dict[str, str] = {}
    for item in sorted(root.rglob("*")):
        if item.is_file() and item.suffix.lower() in _TEXT_SUFFIXES:
            files[item.relative_to(root).as_posix()] = _decode(item.read_bytes())
    reason = None if files else ReasonCode.NO_LATEX_SOURCE
    return FetchResult(arxiv_id=arxiv_id, files=files, reason=reason, cache_dir=root)
