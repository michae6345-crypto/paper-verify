"""The credential seam. One secret, one dependency, one place to replace.

This is a **stopgap**, and naming it honestly is half its value. It authenticates
the *holder of a shared secret*, which is not the same thing as a person. It has
no accounts, no sessions, no per-run ownership and no revocation short of
rotating the value and redeploying. What it does is stop an anonymous caller on
the open internet from releasing a held finding about a named researcher,
suppressing a true one (which also writes a negative fixture that
`tests/test_review.py` reads), or spending our arXiv rate limit.

**Why a dependency and not a middleware.** Real per-user auth is a decision the
owner has not made yet. When it arrives, it replaces the body of `_authenticate`
and the construction of `Principal` — every route keeps the same
`Depends(require_operator)` and the same `principal.label`. A middleware would
have put the same logic behind a path-prefix match, and the set of routes that
must be gated is not expressible as a prefix: `/runs/{id}/report` is gated and
`/runs/{id}/report/public` is not.

**Fail closed.** With `PV_API_SECRET` unset, every gated route answers 503. The
alternative — open when unconfigured — is the shape of every credential system
that has ever been deployed with its auth accidentally switched off, and here the
thing behind the door is an unread accusation about someone by name.

    PV_API_SECRET      unset       the shared secret. Unset means gated routes
                                   are closed, not open.
    PV_OPERATOR_LABEL  see below   what the audit trail records as the deciding
                                   party.

**What goes in the audit trail.** `decided_by` used to be read from the request
body, which made every release and suppression self-declared: the record said
whatever the caller typed. It is now derived from the principal, and with a
shared secret the only true statement available is "somebody holding the operator
key". `PV_OPERATOR_LABEL` lets a single-operator deployment name itself; it does
not let a request name itself, which is the distinction that matters.

**Three ways to present it**, all carrying the same value:

    X-PV-Key: <secret>              the normal one, for a server-side caller
    Authorization: Bearer <secret>  for a client that already has bearer plumbing
    Cookie: pv_key=<secret>         for `EventSource`, which cannot set headers

The cookie exists only because of SSE. `GET /runs/{id}/stream` carries full
`CheckResult` payloads, held findings included, so it has to be gated, and a
browser cannot put a header on an `EventSource`. The option not taken was a
`?key=` query parameter: that value would land in every access log and proxy
trace between here and the client, and a shared secret in a log is a shared
secret in a backup.
"""

from __future__ import annotations

import hmac
import os
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

HEADER = "X-PV-Key"
COOKIE = "pv_key"
SECRET_ENV = "PV_API_SECRET"
OPERATOR_LABEL_ENV = "PV_OPERATOR_LABEL"

# Deliberately not a name. A shared secret identifies a key, and a record saying
# "reviewer" would be claiming to know which person turned it.
DEFAULT_OPERATOR_LABEL = "operator (shared key)"

NOT_CONFIGURED = (
    "This deployment has no operator key configured, so it cannot authenticate "
    "anyone. Set PV_API_SECRET."
)
NOT_AUTHENTICATED = "This endpoint needs the operator key."


@dataclass(frozen=True)
class Principal:
    """Who is asking, to the extent we can honestly say.

    `label` is what lands in the audit trail. It is never a value the request
    supplied — see the module docstring.
    """

    label: str
    operator: bool = False


ANONYMOUS = Principal(label="not identified", operator=False)


def configured_secret() -> str:
    """The secret, read at call time.

    Read per request rather than cached at import, so a test can set it with
    `monkeypatch.setenv` and so a process that has one injected after start does
    not need a restart to see it. The cost is one dict lookup on a gated route.
    """
    return (os.getenv(SECRET_ENV) or "").strip()


def operator_label() -> str:
    return (os.getenv(OPERATOR_LABEL_ENV) or "").strip() or DEFAULT_OPERATOR_LABEL


def presented(request: Request) -> str:
    """The credential this request carries, from whichever of the three it used.

    Header first, then bearer, then cookie: a caller that can set a header is
    being explicit, and a cookie is the fallback for the one transport that has
    no other option.
    """
    header = (request.headers.get(HEADER) or "").strip()
    if header:
        return header

    authorization = (request.headers.get("Authorization") or "").strip()
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() == "bearer" and value.strip():
        return value.strip()

    return (request.cookies.get(COOKIE) or "").strip()


def _authenticate(request: Request) -> Principal:
    """The whole of the current auth mechanism. Replace this body, not the routes.

    Raises rather than returning `ANONYMOUS` on a bad credential: a caller that
    presented the wrong key wants to know it was wrong, and every gated route
    here needs an operator anyway.
    """
    secret = configured_secret()
    if not secret:
        # Closed, not open. 503 rather than 401 because the caller did nothing
        # wrong and there is no credential they could send that would work — this
        # is an operator's problem to fix, and saying so is what gets it fixed.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NOT_CONFIGURED
        )

    offered = presented(request)
    # Compared with `compare_digest`, so the failure takes the same time whatever
    # the first wrong byte was.
    if not offered or not hmac.compare_digest(offered, secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=NOT_AUTHENTICATED,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Principal(label=operator_label(), operator=True)


def require_operator(request: Request) -> Principal:
    """Every mutating endpoint, and every read that is not redacted.

    The two sets are one dependency on purpose. `GET /runs/{id}/report` is not a
    mutation, and leaving it open is the same failure as leaving
    `POST .../release` open: both put a held finding in front of a reader who has
    no business seeing it yet. Only `/report/public` — which runs every finding
    through `redact()` — is outside this.
    """
    return _authenticate(request)


__all__ = [
    "ANONYMOUS",
    "COOKIE",
    "DEFAULT_OPERATOR_LABEL",
    "HEADER",
    "NOT_AUTHENTICATED",
    "NOT_CONFIGURED",
    "OPERATOR_LABEL_ENV",
    "Principal",
    "SECRET_ENV",
    "configured_secret",
    "operator_label",
    "presented",
    "require_operator",
]
