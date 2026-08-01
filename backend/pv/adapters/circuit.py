"""Circuit breaker over the HTTP adapter (§14.7).

Crossref and OpenAlex are free, unauthenticated services we are guests on
(CLAUDE.md). When one of them is down, every reference in a bibliography produces
the same timeout, and a fifty-reference paper sends fifty pointless requests at a
server that is already struggling. That is both slow and rude, and it is how an
IP gets banned.

After five consecutive failures to one host the breaker opens: further requests
to that host return immediately as a failed response, with `status is None` and
an `error_kind`, which every checker already reads as
`unverifiable / network_error`. Nothing about the reason code changes — the
breaker only stops us re-learning it one request at a time.

**It never converts a failure into a verdict.** An open circuit means we know
less, not more: a check whose lookups were short-circuited says `unverifiable`,
exactly as it would have after waiting for the timeouts. Only transport failures
count — a 404 is an answer about the resource and leaves the circuit closed.

Keyed by host and shared across clients, because "Crossref is down" is a fact
about the process, not about one check. After a cooldown one request is let
through to find out whether that is still true.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Mapping
from urllib.parse import urlsplit

from .http import ErrorKind, HttpClient, HttpResponse

# §14.7: "circuit breaker opens after 5 failures".
DEFAULT_THRESHOLD = 5
# Long enough not to hammer a service that is down; short enough that a run
# starting a minute later is not punished for the last one's bad luck.
DEFAULT_COOLDOWN_SECONDS = 60.0


@dataclass
class _HostCircuit:
    consecutive_failures: int = 0
    opened_at: float | None = None


@dataclass
class CircuitBreaker:
    """Consecutive-failure counters, one per host."""

    threshold: int = DEFAULT_THRESHOLD
    cooldown_s: float = DEFAULT_COOLDOWN_SECONDS
    _hosts: dict[str, _HostCircuit] = field(default_factory=dict)

    def _circuit(self, host: str) -> _HostCircuit:
        circuit = self._hosts.get(host)
        if circuit is None:
            circuit = _HostCircuit()
            self._hosts[host] = circuit
        return circuit

    def is_open(self, host: str, now: float | None = None) -> bool:
        """True while requests to `host` should be short-circuited.

        The cooldown expiring half-opens the circuit: the counter is reset so the
        next request goes out for real. If it fails, the count starts again from
        one — we do not re-open on a single probe, because one failure is not
        evidence a service is down.
        """
        circuit = self._hosts.get(host)
        if circuit is None or circuit.opened_at is None:
            return False
        if (now or time.monotonic()) - circuit.opened_at >= self.cooldown_s:
            circuit.opened_at = None
            circuit.consecutive_failures = 0
            return False
        return True

    def record(self, host: str, *, failed: bool, now: float | None = None) -> None:
        """One outcome. `failed` is `HttpResponse.failed` — the exchange never
        happened. A 404 is not a failure; it is an answer."""
        circuit = self._circuit(host)
        if not failed:
            circuit.consecutive_failures = 0
            circuit.opened_at = None
            return
        circuit.consecutive_failures += 1
        if circuit.consecutive_failures >= self.threshold and circuit.opened_at is None:
            circuit.opened_at = now or time.monotonic()

    def reset(self, host: str | None = None) -> None:
        if host is None:
            self._hosts.clear()
        else:
            self._hosts.pop(host, None)

    def open_hosts(self) -> list[str]:
        return [host for host in self._hosts if self.is_open(host)]


class BreakingClient(HttpClient):
    """An `HttpClient` that stops asking a host that has stopped answering.

    A decorator rather than a branch inside `HttpxClient`: §13 says every
    implementation choice is an interface with more than one implementation, and
    this way the breaker is testable against `FakeClient` without a socket.
    """

    def __init__(self, inner: HttpClient, breaker: CircuitBreaker | None = None) -> None:
        self.inner = inner
        self.breaker = breaker if breaker is not None else default_breaker()

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
        host = (urlsplit(url).hostname or "").lower()
        if host and self.breaker.is_open(host):
            return HttpResponse(
                url=url,
                method=method.upper(),
                status=None,
                error_kind=ErrorKind.CONNECTION,
                error_detail=(
                    f"{host} failed {self.breaker.threshold} times in a row; "
                    "further requests to it were not attempted"
                ),
            )

        response = await self.inner.request(
            method,
            url,
            params=params,
            headers=headers,
            follow_redirects=follow_redirects,
            use_cache=use_cache,
        )
        if host and not response.from_cache:
            self.breaker.record(host, failed=response.failed)
        return response

    async def aclose(self) -> None:
        await self.inner.aclose()


_default: CircuitBreaker | None = None


def default_breaker() -> CircuitBreaker:
    """The process-wide breaker. Shared on purpose: each check builds its own
    client, and a per-client breaker would re-discover that Crossref is down once
    per check, which is the behaviour this module exists to prevent."""
    global _default
    if _default is None:
        _default = CircuitBreaker()
    return _default


def reset_breakers() -> None:
    """Forget every host. For tests, and for a worker starting fresh."""
    default_breaker().reset()


__all__ = [
    "DEFAULT_COOLDOWN_SECONDS",
    "DEFAULT_THRESHOLD",
    "BreakingClient",
    "CircuitBreaker",
    "default_breaker",
    "reset_breakers",
]
