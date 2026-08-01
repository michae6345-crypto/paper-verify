"""HTTP adapter: the only way checks reach the network.

Per §13, this is written as an interface with more than one implementation, selected
by an env var — call sites never branch on `LOCAL`. Implementations:

  - `HttpxClient`   — real network access, rate limited, retried, disk cached.
  - `OfflineClient` — every request comes back as a network error, so checks degrade
                      to `unverifiable` rather than inventing a verdict.
  - `FakeClient`    — deterministic routes, for tests.

The governing rule of this workstream is encoded in the response object: a request
that did not complete has `status is None` and an `error_kind`. It is never confused
with a 404. A check that cannot reach a server has learned nothing about that server.

Environment:
  HTTP_BACKEND            live | offline            (default: live)
  HTTP_CACHE_DIR          default ./.httpcache
  HTTP_CACHE_TTL_SECONDS  default 604800 (7 days); 0 means never expire
  HTTP_CONCURRENCY        global cap, default 8
  HTTP_MIN_INTERVAL       default seconds between requests to one host, default 1.0
  HTTP_TIMEOUT            per-attempt seconds, default 15
  CONTACT_EMAIL           goes in the User-Agent and in `mailto` query parameters
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import random
import re
import ssl
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable, Mapping, TypeVar
from urllib.parse import urlsplit

import httpx

VERSION = "0.1"

DEFAULT_CONTACT_EMAIL = "paper-verify@example.com"

# Politeness floor per host, in seconds. arXiv's is contractual (CLAUDE.md); the
# others are courtesy for free, unauthenticated APIs that we are guests on.
HOST_MIN_INTERVAL: dict[str, float] = {
    "arxiv.org": 3.0,
    "export.arxiv.org": 3.0,
    "api.crossref.org": 1.0,
    "api.openalex.org": 1.0,
    "api.github.com": 1.0,
    "gitlab.com": 1.0,
}

# Statuses worth writing to disk: the server told us something definitive about the
# resource. 429 and 5xx tell us about the server's mood, so they are never cached.
CACHEABLE_STATUSES = frozenset({200, 201, 203, 204, 301, 302, 307, 308, 400, 401, 403, 404, 405, 410, 451, 501})

RETRYABLE_STATUSES = frozenset({500, 502, 503, 504, 507, 508, 522, 524})

MAX_ATTEMPTS = 3
MAX_RETRY_AFTER_WAIT = 5.0


class ErrorKind(str, Enum):
    """Why a request did not produce an answer. All of these mean `unverifiable`."""

    TIMEOUT = "timeout"
    DNS = "dns"
    TLS = "tls"
    CONNECTION = "connection"
    TOO_MANY_REDIRECTS = "too_many_redirects"
    RATE_LIMITED = "rate_limited"
    SERVER_ERROR = "server_error"
    INVALID_URL = "invalid_url"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class HttpResponse:
    """One completed *or failed* request.

    `status is None` means the exchange never happened — do not read that as any
    statement about the resource.
    """

    url: str
    method: str = "GET"
    status: int | None = None
    final_url: str = ""
    headers: Mapping[str, str] = field(default_factory=dict)
    text: str = ""
    error_kind: ErrorKind | None = None
    error_detail: str = ""
    from_cache: bool = False
    attempts: int = 1
    elapsed_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.status is not None and 200 <= self.status < 300

    @property
    def failed(self) -> bool:
        """True when we learned nothing. Callers must return unverifiable."""
        return self.status is None

    @property
    def redirected(self) -> bool:
        return bool(self.final_url) and self.final_url != self.url

    def json(self) -> Any | None:
        if not self.text:
            return None
        try:
            return json.loads(self.text)
        except ValueError:
            return None


# --------------------------------------------------------------------------
# Interface
# --------------------------------------------------------------------------


class HttpClient:
    """The surface every check codes against."""

    async def request(
        self,
        method: str,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        follow_redirects: bool = True,
        use_cache: bool = True,
    ) -> HttpResponse:
        raise NotImplementedError

    async def get(self, url: str, **kw: Any) -> HttpResponse:
        return await self.request("GET", url, **kw)

    async def head(self, url: str, **kw: Any) -> HttpResponse:
        return await self.request("HEAD", url, **kw)

    async def get_json(self, url: str, **kw: Any) -> tuple[HttpResponse, Any | None]:
        resp = await self.get(url, **kw)
        return resp, (resp.json() if resp.ok else None)

    async def aclose(self) -> None:
        return None

    async def __aenter__(self) -> "HttpClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()


# --------------------------------------------------------------------------
# Rate limiting
# --------------------------------------------------------------------------


class HostRateLimiter:
    """One in-flight request per host at a time, with a minimum gap between them.

    The lock is held across the sleep on purpose: that is what makes it a single
    connection per domain rather than a burst that happens to be spaced on average.
    """

    def __init__(self, default_interval: float = 1.0, overrides: Mapping[str, float] | None = None):
        self.default_interval = default_interval
        self.overrides = dict(overrides or HOST_MIN_INTERVAL)
        self._locks: dict[str, asyncio.Lock] = {}
        self._next_allowed: dict[str, float] = {}

    def interval_for(self, host: str) -> float:
        host = host.lower()
        if host in self.overrides:
            return self.overrides[host]
        # Subdomain inherits its parent's floor: api.github.com under github.com.
        parts = host.split(".")
        for i in range(1, len(parts) - 1):
            parent = ".".join(parts[i:])
            if parent in self.overrides:
                return self.overrides[parent]
        return self.default_interval

    def _lock(self, host: str) -> asyncio.Lock:
        lock = self._locks.get(host)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[host] = lock
        return lock

    async def acquire(self, host: str) -> "HostRateLimiter._Slot":
        host = host.lower()
        lock = self._lock(host)
        await lock.acquire()
        wait = self._next_allowed.get(host, 0.0) - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        return HostRateLimiter._Slot(self, host, lock)

    def _release(self, host: str, lock: asyncio.Lock) -> None:
        self._next_allowed[host] = time.monotonic() + self.interval_for(host)
        lock.release()

    class _Slot:
        def __init__(self, limiter: "HostRateLimiter", host: str, lock: asyncio.Lock):
            self._limiter, self._host, self._lock = limiter, host, lock

        async def __aenter__(self) -> "HostRateLimiter._Slot":
            return self

        async def __aexit__(self, *exc: object) -> None:
            self._limiter._release(self._host, self._lock)


# --------------------------------------------------------------------------
# Disk cache
# --------------------------------------------------------------------------


class ResponseCache:
    """Keyed by method + resolved URL. Re-runs during development cost nothing,
    which is the whole reason we can afford to be polite in the first place."""

    def __init__(self, directory: str | Path, ttl_seconds: int = 604_800):
        self.directory = Path(directory)
        self.ttl_seconds = ttl_seconds

    def _path(self, method: str, url: str) -> Path:
        digest = hashlib.sha256(f"{method.upper()}\n{url}".encode("utf-8")).hexdigest()
        return self.directory / digest[:2] / f"{digest}.json"

    def get(self, method: str, url: str) -> HttpResponse | None:
        path = self._path(method, url)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if self.ttl_seconds and time.time() - payload.get("stored_at", 0) > self.ttl_seconds:
            return None
        return HttpResponse(
            url=payload["url"],
            method=payload.get("method", method),
            status=payload.get("status"),
            final_url=payload.get("final_url", ""),
            headers=payload.get("headers", {}),
            text=payload.get("text", ""),
            from_cache=True,
        )

    def put(self, response: HttpResponse) -> None:
        if response.status not in CACHEABLE_STATUSES:
            return
        path = self._path(response.method, response.url)
        payload = {
            "url": response.url,
            "method": response.method,
            "status": response.status,
            "final_url": response.final_url,
            "headers": dict(response.headers),
            "text": response.text,
            "stored_at": time.time(),
        }
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(payload), encoding="utf-8")
            tmp.replace(path)
        except OSError:
            # A cache that cannot be written is a slow run, not a failed one.
            pass


# --------------------------------------------------------------------------
# Real implementation
# --------------------------------------------------------------------------


def user_agent(contact_email: str | None = None) -> str:
    email = contact_email or os.getenv("CONTACT_EMAIL") or DEFAULT_CONTACT_EMAIL
    return f"paper-verify/{VERSION} (+https://github.com/paper-verify; mailto:{email})"


def contact_email() -> str:
    return os.getenv("CONTACT_EMAIL") or DEFAULT_CONTACT_EMAIL


def _classify(exc: Exception) -> tuple[ErrorKind, str]:
    detail = f"{type(exc).__name__}: {exc}"
    if isinstance(exc, httpx.TooManyRedirects):
        return ErrorKind.TOO_MANY_REDIRECTS, detail
    if isinstance(exc, httpx.TimeoutException):
        return ErrorKind.TIMEOUT, detail
    if isinstance(exc, (ssl.SSLError, httpx.ProxyError)) or "SSL" in detail or "CERTIFICATE" in detail.upper():
        return ErrorKind.TLS, detail
    if isinstance(exc, httpx.ConnectError):
        lowered = detail.lower()
        if "name or service not known" in lowered or "getaddrinfo" in lowered or "nodename" in lowered:
            return ErrorKind.DNS, detail
        return ErrorKind.CONNECTION, detail
    if isinstance(exc, httpx.InvalidURL) or isinstance(exc, httpx.UnsupportedProtocol):
        return ErrorKind.INVALID_URL, detail
    if isinstance(exc, httpx.HTTPError):
        return ErrorKind.CONNECTION, detail
    return ErrorKind.UNKNOWN, detail


class HttpxClient(HttpClient):
    def __init__(
        self,
        *,
        concurrency: int = 8,
        timeout: float = 15.0,
        cache: ResponseCache | None = None,
        limiter: HostRateLimiter | None = None,
        contact: str | None = None,
        max_attempts: int = MAX_ATTEMPTS,
    ):
        self.timeout = timeout
        self.cache = cache
        self.limiter = limiter or HostRateLimiter()
        self.max_attempts = max_attempts
        self._semaphore = asyncio.Semaphore(concurrency)
        self._client: httpx.AsyncClient | None = None
        self._headers = {
            "User-Agent": user_agent(contact),
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate",
        }

    def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers=self._headers,
                timeout=httpx.Timeout(self.timeout),
                follow_redirects=True,
                max_redirects=8,
                limits=httpx.Limits(max_connections=8, max_keepalive_connections=4),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def request(
        self,
        method: str,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        follow_redirects: bool = True,
        use_cache: bool = True,
    ) -> HttpResponse:
        method = method.upper()
        resolved = _with_params(url, params)
        host = urlsplit(resolved).hostname or ""
        if not host or urlsplit(resolved).scheme not in ("http", "https"):
            return HttpResponse(url=resolved, method=method, error_kind=ErrorKind.INVALID_URL,
                                error_detail="not an absolute http(s) URL")

        if use_cache and self.cache is not None:
            cached = self.cache.get(method, resolved)
            if cached is not None:
                return cached

        started = time.monotonic()
        last: HttpResponse | None = None
        for attempt in range(1, self.max_attempts + 1):
            async with self._semaphore:
                slot = await self.limiter.acquire(host)
                async with slot:
                    try:
                        raw = await self._ensure_client().request(
                            method, resolved, headers=dict(headers or {}), follow_redirects=follow_redirects
                        )
                        response = HttpResponse(
                            url=resolved,
                            method=method,
                            status=raw.status_code,
                            final_url=str(raw.url),
                            headers={k.lower(): v for k, v in raw.headers.items()},
                            text=raw.text if _is_texty(raw) else "",
                            attempts=attempt,
                            elapsed_ms=int((time.monotonic() - started) * 1000),
                        )
                    except Exception as exc:  # noqa: BLE001 - every failure is data
                        kind, detail = _classify(exc)
                        response = HttpResponse(
                            url=resolved, method=method, error_kind=kind, error_detail=detail,
                            attempts=attempt, elapsed_ms=int((time.monotonic() - started) * 1000),
                        )

            last = response
            if not _should_retry(response) or attempt == self.max_attempts:
                break
            await asyncio.sleep(_backoff(attempt, response))

        assert last is not None
        result = _finalize(last)
        if use_cache and self.cache is not None and not result.failed:
            self.cache.put(result)
        return result


def _is_texty(raw: httpx.Response) -> bool:
    ctype = raw.headers.get("content-type", "")
    if not ctype:
        return len(raw.content) < 1_000_000
    return any(t in ctype for t in ("json", "text", "xml", "html")) and len(raw.content) < 5_000_000


def _should_retry(response: HttpResponse) -> bool:
    if response.error_kind in (ErrorKind.TIMEOUT, ErrorKind.CONNECTION):
        return True
    return response.status in RETRYABLE_STATUSES or response.status == 429


def _backoff(attempt: int, response: HttpResponse) -> float:
    if response.status == 429:
        raw = str(response.headers.get("retry-after", "")).strip()
        if raw.isdigit():
            return min(float(raw), MAX_RETRY_AFTER_WAIT)
    return min(0.5 * (2 ** (attempt - 1)) + random.uniform(0, 0.25), 8.0)


def _finalize(response: HttpResponse) -> HttpResponse:
    """A 429 or a 5xx that survived every retry is a network condition, not a
    statement about the resource. Convert it so no caller can mistake it for one."""
    if response.status == 429:
        return _as_error(response, ErrorKind.RATE_LIMITED, "429 after retries")
    if response.status is not None and response.status >= 500:
        return _as_error(response, ErrorKind.SERVER_ERROR, f"{response.status} after retries")
    return response


def _as_error(response: HttpResponse, kind: ErrorKind, detail: str) -> HttpResponse:
    return HttpResponse(
        url=response.url, method=response.method, status=None, final_url=response.final_url,
        headers=response.headers, text="", error_kind=kind,
        error_detail=f"{detail} (upstream status {response.status})",
        attempts=response.attempts, elapsed_ms=response.elapsed_ms,
    )


def _with_params(url: str, params: Mapping[str, Any] | None) -> str:
    if not params:
        return url
    try:
        return str(httpx.URL(url).copy_merge_params({k: str(v) for k, v in params.items()}))
    except Exception:  # noqa: BLE001
        return url


# --------------------------------------------------------------------------
# Offline and fake implementations
# --------------------------------------------------------------------------


class OfflineClient(HttpClient):
    """Selected by HTTP_BACKEND=offline. Answers nothing, admits it every time."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def request(self, method: str, url: str, *, params: Mapping[str, Any] | None = None,
                      headers: Mapping[str, str] | None = None, follow_redirects: bool = True,
                      use_cache: bool = True) -> HttpResponse:
        resolved = _with_params(url, params)
        self.calls.append((method.upper(), resolved))
        return HttpResponse(url=resolved, method=method.upper(), error_kind=ErrorKind.OFFLINE,
                            error_detail="HTTP_BACKEND=offline")


Route = HttpResponse | Callable[[str, str], HttpResponse]


class FakeClient(HttpClient):
    """Test double. Routes are matched by exact URL first, then by regex."""

    def __init__(self, routes: Mapping[str, Route] | None = None,
                 default: Route | None = None):
        self.routes: dict[str, Route] = dict(routes or {})
        self.default = default
        self.calls: list[tuple[str, str]] = []

    def add(self, pattern: str, route: Route) -> "FakeClient":
        self.routes[pattern] = route
        return self

    async def request(self, method: str, url: str, *, params: Mapping[str, Any] | None = None,
                      headers: Mapping[str, str] | None = None, follow_redirects: bool = True,
                      use_cache: bool = True) -> HttpResponse:
        method = method.upper()
        resolved = _with_params(url, params)
        self.calls.append((method, resolved))
        route = self.routes.get(resolved)
        if route is None:
            for pattern, candidate in self.routes.items():
                if re.search(pattern, resolved):
                    route = candidate
                    break
        if route is None:
            route = self.default
        if route is None:
            return HttpResponse(url=resolved, method=method, status=404, final_url=resolved)
        if callable(route):
            route = route(method, resolved)
        return HttpResponse(
            url=resolved, method=method, status=route.status,
            final_url=route.final_url or resolved, headers=route.headers, text=route.text,
            error_kind=route.error_kind, error_detail=route.error_detail,
        )


def ok(text: str = "", status: int = 200, final_url: str = "",
       headers: Mapping[str, str] | None = None) -> HttpResponse:
    """Convenience constructor for FakeClient routes."""
    return HttpResponse(url="", status=status, final_url=final_url, text=text,
                        headers=dict(headers or {}))


def network_error(kind: ErrorKind = ErrorKind.TIMEOUT, detail: str = "") -> HttpResponse:
    return HttpResponse(url="", status=None, error_kind=kind, error_detail=detail or kind.value)


# --------------------------------------------------------------------------
# Selection and the sync bridge
# --------------------------------------------------------------------------


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ[name])
    except (KeyError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


def get_http_client() -> HttpClient:
    """The single place the backend is chosen. Do not branch on env anywhere else."""
    if os.getenv("HTTP_BACKEND", "live").strip().lower() == "offline":
        return OfflineClient()
    ttl = _env_int("HTTP_CACHE_TTL_SECONDS", 604_800)
    cache_dir = os.getenv("HTTP_CACHE_DIR", ".httpcache")
    return HttpxClient(
        concurrency=_env_int("HTTP_CONCURRENCY", 8),
        timeout=_env_float("HTTP_TIMEOUT", 15.0),
        cache=ResponseCache(cache_dir, ttl) if cache_dir else None,
        limiter=HostRateLimiter(default_interval=_env_float("HTTP_MIN_INTERVAL", 1.0)),
    )


T = TypeVar("T")


def run_sync(coro: Awaitable[T]) -> T:
    """Bridge for the checker interface, which is synchronous (`run(ctx)`).

    If a loop is already running in this thread — a check invoked from inside the
    FastAPI server — the work moves to a private loop on a worker thread rather
    than raising.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)  # type: ignore[arg-type]

    box: dict[str, Any] = {}

    def _worker() -> None:
        try:
            box["value"] = asyncio.run(coro)  # type: ignore[arg-type]
        except BaseException as exc:  # noqa: BLE001
            box["error"] = exc

    thread = threading.Thread(target=_worker, name="pv-http", daemon=True)
    thread.start()
    thread.join()
    if "error" in box:
        raise box["error"]
    return box["value"]
