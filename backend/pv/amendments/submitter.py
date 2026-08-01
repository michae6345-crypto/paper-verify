"""Who filed an amendment. Today: nobody we can name.

This module exists to be replaced, and to make replacing it a one-function change
rather than a change to every endpoint that touches an amendment.

**There is no auth layer in this system.** That decision sits above this
workstream, and building one here would be building the wrong thing badly. What
this workstream can do is make sure the hole is shaped so it can be closed:

1.  Identity is derived from the **request**, never from the request body. A
    client-supplied `author_name` is not an identity, it is a text field, and a
    field that looks like an identity but is not is worse than no field — it
    invites the UI to print "submitted by Ashish Vaswani" beside a statement
    anyone could have sent. So `submitter_of(request)` reads the transport, and
    today the transport carries nothing.

2.  The endpoints already carry the answer through to the review queue, where it
    is displayed as unverified. The day an auth layer lands, `submitter_of` reads
    a session or a verified header and returns `verified=True`; nothing above it
    changes shape, and the queue starts showing a name it can stand behind.

3.  Until then `requires_review` returns True for everything, which is what makes
    the review gate — not an identity check — the control that actually holds. An
    unverified statement is a signal for a person to look at, never an automatic
    correction to a published page.

The one thing this must never do is guess. An IP address, a user agent, or a
self-declared name are not identities, and recording one as though it were would
put a named attribution on a public page that nobody can defend.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Submitter:
    """Who we can say filed a statement, and how sure we are.

    `label` is what a reviewer sees. It is never a name we were told; with no auth
    layer it is a fixed string that says exactly what we know, which is nothing.
    """

    # A stable identifier once one exists — a user id, an ORCID, a verified email.
    # Empty means we have none, which is the only honest value today.
    identity: str = ""
    # False until an auth layer establishes this. Nothing downstream may treat an
    # unverified submitter as an author of the paper.
    verified: bool = False
    # How the identity was established, for the record: "none" | "session" |
    # "orcid" | ... Mirrors `Column.direction_source` and `Table.header_source`,
    # which exist for the same reason — a value is not usable without knowing
    # where it came from.
    source: str = "none"

    @property
    def label(self) -> str:
        if not self.verified or not self.identity:
            # §7: states what happened, blames nobody. A statement from an
            # unidentified sender is a normal thing to receive; it is just not
            # something we can publish as an author's response.
            return "Sender not identified"
        return self.identity


UNKNOWN = Submitter()


def submitter_of(request) -> Submitter:
    """Who sent this. Always `UNKNOWN` today.

    Takes the request rather than a body field on purpose — see the module
    docstring. The parameter is unused precisely because there is nothing on a
    request we are willing to treat as an identity yet, and naming it keeps the
    call sites correct for the day there is.
    """
    return UNKNOWN


def requires_review(submitter: Submitter) -> bool:
    """Whether a statement from this sender must be read before it is public.

    True for everything, and it will stay true for everything unverified. This is
    the policy the review gate reads, kept in one place so that turning it into
    "verified authors publish immediately" is a change here and nowhere else.
    """
    return not submitter.verified


__all__ = ["Submitter", "UNKNOWN", "requires_review", "submitter_of"]
