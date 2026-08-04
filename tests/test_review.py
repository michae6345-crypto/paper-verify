"""The review gate (§14.8). What must be read by a human before it is public.

Network-free: nothing here drives the pipeline. The gate is a decision about a
report, and a report can be built.

What this suite is protecting, in order of how badly it would hurt to lose:
  - a high-severity divergence nobody has read is not on a permalink, and no
    configuration makes it so;
  - redaction never leaves a verdict standing on evidence it has withheld;
  - a suppression writes a negative fixture, so the false positive we caught once
    becomes a permanent regression test rather than a decision someone remembers.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pv.amendments.identity import amendment_fingerprint, finding_fingerprint
from pv.amendments.store import AmendmentStore
from pv.api import app as app_module
from pv.api.config import Settings
from pv.api.security import HEADER, SECRET_ENV
from pv.api.store import RunStore
from pv.models import (
    Amendment,
    Anchor,
    CheckResult,
    Finding,
    ReasonCode,
    RunReport,
    Severity,
    Verdict,
)
from pv.review import (
    DECLINE_LABEL,
    SUPPRESSION_LABEL,
    SUPPRESSIONS_DIR,
    AmendmentDeclineReason,
    ReleaseRequiresReview,
    ReviewKind,
    ReviewQueue,
    ReviewState,
    SuppressionReason,
    Withheld,
    held_notice,
    is_gated,
    read_negative_fixtures,
    redact,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "papers"


# --------------------------------------------------------------------------
# Material. The validated corpus produces no `diverges` at all, so a suite about
# what happens when we accuse someone has to build the accusation itself. The
# paper described here does not exist.
# --------------------------------------------------------------------------


def a_finding(dom_id: str = "tab:main/r2/c3", severity: Severity = Severity.HIGH) -> Finding:
    return Finding(
        severity=severity,
        siglum="a",
        claimed="87.4",
        computed="84.1",
        delta="-3.3",
        anchor=Anchor(
            kind="table_cell",
            dom_id=dom_id,
            human_locator='Table 3, row 2, column "Ours"',
        ),
        verbatim="Our method reaches 87.4 on the held-out split.",
        explanation="87.4 is bolded, but 84.1 is the highest value in this block.",
    )


def a_check(findings: list[Finding], verdict: Verdict = Verdict.DIVERGES) -> CheckResult:
    return CheckResult(
        checker="bold_extreme",
        checker_version="1",
        policy_version="1",
        verdict=verdict,
        display_name="Bolded value is the best in its block",
        findings=findings,
    )


def a_clean_check() -> CheckResult:
    return CheckResult(
        checker="row_arithmetic",
        checker_version="1",
        policy_version="1",
        verdict=Verdict.MATCHES,
        display_name="Average columns match their row",
    )


def a_report(*checks: CheckResult) -> RunReport:
    return RunReport(
        arxiv_id="0000.00000",
        title="A synthetic paper for interface development",
        checks=list(checks) or [a_check([a_finding()])],
    )


@pytest.fixture
def queue(tmp_path):
    """A queue that writes its fixtures somewhere disposable, so a test never
    commits a suppression."""
    return ReviewQueue(suppressions_dir=tmp_path / "suppressions")


# --------------------------------------------------------------------------
# The rule
# --------------------------------------------------------------------------


def test_the_gate_holds_high_severity_divergences():
    check = a_check([a_finding()])
    assert is_gated(check, check.findings[0])


def test_the_gate_does_not_hold_a_lower_severity_divergence():
    check = a_check([a_finding(severity=Severity.MEDIUM)])
    assert not is_gated(check, check.findings[0])


def test_the_gate_does_not_hold_a_high_severity_finding_that_is_not_a_divergence():
    """A `within_tolerance` finding at high severity is not an accusation. §5.5
    calls the tolerance result a normal outcome and it must not queue behind a
    human."""
    check = a_check([a_finding()], verdict=Verdict.WITHIN_TOLERANCE)
    assert not is_gated(check, check.findings[0])


def test_a_finding_nobody_has_decided_on_is_held(queue):
    """Absence means held. This has to be true of a finding whose review row was
    lost, not only of one whose row says so — there is no state of the system in
    which an unread high-severity divergence becomes public."""
    assert queue.state_of("run", "0" * 64) is ReviewState.HELD
    assert queue.is_public("run", "0" * 64) is False


# --------------------------------------------------------------------------
# Redaction
# --------------------------------------------------------------------------


def test_a_held_finding_is_not_on_the_public_report(queue):
    report = a_report()
    public, withheld = redact(report, queue, "run")
    assert withheld.findings == 1
    assert public.checks == []


def test_a_check_whose_evidence_is_all_held_loses_its_verdict_too(queue):
    """The recurring defect in this codebase is a narrowing step that discards the
    data and keeps the confident accusation. Publishing `diverges` with no finding
    behind it is exactly that, wearing a review gate as a hat."""
    public, _held = redact(a_report(), queue, "run")
    assert [c.verdict for c in public.checks] == []


def test_a_check_keeps_the_findings_that_are_not_held(queue):
    """The verdict is still supported by what remains on the page, so the row
    stays."""
    check = a_check([a_finding(), a_finding("tab:main/r9/c3", severity=Severity.LOW)])
    public, withheld = redact(a_report(check), queue, "run")
    assert withheld.findings == 1
    assert len(public.checks) == 1
    assert [f.anchor.dom_id for f in public.checks[0].findings] == ["tab:main/r9/c3"]


def test_releasing_a_finding_puts_it_on_the_public_report(queue):
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.release("run", report, fp, by="reviewer")

    public, withheld = redact(report, queue, "run")
    assert withheld.findings == 0
    assert len(public.checks) == 1
    assert public.checks[0].findings[0].claimed == "87.4"


def test_a_suppressed_finding_stays_off_the_public_report(queue):
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.suppress("run", report, fp, reason=SuppressionReason.COMPARISON_SET_WRONG)

    public, withheld = redact(report, queue, "run")
    assert withheld.findings == 1
    assert public.checks == []


def test_redaction_never_touches_the_stored_report(queue):
    """The report is the record of what the run found. The gate governs
    publication, not the record — a suppressed finding stays readable internally
    and defensible a year later."""
    report = a_report()
    before = report.model_dump_json()
    redact(report, queue, "run")
    assert report.model_dump_json() == before


def test_a_report_with_nothing_to_hold_passes_through_unchanged(queue):
    report = a_report(a_clean_check())
    public, withheld = redact(report, queue, "run")
    assert withheld.findings == 0
    assert public.model_dump_json() == report.model_dump_json()


def test_decisions_do_not_leak_between_runs(queue):
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.release("one", report, fp)
    assert queue.is_public("one", fp) is True
    assert queue.is_public("two", fp) is False


def test_deciding_on_a_finding_the_gate_does_not_hold_is_refused(queue):
    """A release affects what is published. It must not be possible to record one
    against something the gate was never holding."""
    report = a_report(a_check([a_finding(severity=Severity.LOW)]))
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    with pytest.raises(ReleaseRequiresReview):
        queue.release("run", report, fp)


# --------------------------------------------------------------------------
# Amendments in the gate
#
# There is no auth layer (`pv.amendments.submitter`), so anyone who can reach the
# endpoint can file a statement against any finding on any paper. These are the
# tests that make that survivable.
# --------------------------------------------------------------------------


def a_contested_report(statement: str = "The table is right.") -> tuple[RunReport, str]:
    """A report with one high-severity divergence and one statement against it."""
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    report.amendments = [
        Amendment(finding_fingerprint=fp, author_statement=statement, status="open")
    ]
    return report, fp


def test_a_statement_from_an_unknown_party_is_not_on_the_public_report(queue):
    report, _fp = a_contested_report()
    public, withheld = redact(report, queue, "run")
    assert withheld.amendments == 1
    assert public.amendments == []


def test_contesting_a_finding_does_not_suppress_it(queue):
    """**The one that matters.** With no auth layer, if a contest could hide a
    finding then anyone who could reach the endpoint could erase any finding from
    any public report by objecting to it — and the flow built to protect authors
    from a false accusation would become the mechanism for burying a true one.

    A released finding stays released no matter what is said about it."""
    report, fp = a_contested_report()
    queue.release("run", report, fp, by="reviewer")

    public, withheld = redact(report, queue, "run")
    assert withheld.findings == 0
    assert len(public.checks) == 1
    assert public.checks[0].findings[0].claimed == "87.4"
    # The statement is the only thing withheld.
    assert withheld.amendments == 1
    assert public.amendments == []


def test_a_held_finding_and_its_amendment_are_two_decisions(queue):
    """Releasing one must never release the other. They are different claims by
    different parties, and only one of them is ours."""
    report, fp = a_contested_report()
    afp = amendment_fingerprint(report.amendments[0])

    queue.release("run", report, afp, kind=ReviewKind.AMENDMENT, by="reviewer")
    public, withheld = redact(report, queue, "run")

    assert withheld.amendments == 0
    assert len(public.amendments) == 1
    # The finding was never released, so it is still withheld.
    assert withheld.findings == 1
    assert public.checks == []


def test_a_released_statement_appears_beside_a_released_finding(queue):
    report, fp = a_contested_report()
    afp = amendment_fingerprint(report.amendments[0])
    queue.release("run", report, fp, by="reviewer")
    queue.release("run", report, afp, kind=ReviewKind.AMENDMENT, by="reviewer")

    public, withheld = redact(report, queue, "run")
    assert not withheld
    assert len(public.checks) == 1
    assert public.amendments[0].author_statement == "The table is right."


def test_every_amendment_row_is_its_own_decision(queue):
    """A recheck appends a superseding row carrying our sentence alongside theirs.
    That row is text nobody has read, so releasing the first does not release it."""
    report, fp = a_contested_report()
    first = report.amendments[0]
    report.amendments.append(
        first.model_copy(
            update={
                "status": "recheck_requested",
                "resolution_note": "Checked again at row_arithmetic v2.",
                "submitted_at": datetime(2026, 8, 2, tzinfo=timezone.utc),
            }
        )
    )
    queue.release(
        "run", report, amendment_fingerprint(first), kind=ReviewKind.AMENDMENT
    )

    public, withheld = redact(report, queue, "run")
    assert withheld.amendments == 1
    assert len(public.amendments) == 1


def test_declining_a_statement_keeps_it_off_the_permalink(queue):
    report, _fp = a_contested_report()
    afp = amendment_fingerprint(report.amendments[0])
    queue.decline(
        "run", report, afp, reason=AmendmentDeclineReason.AUTHORSHIP_UNVERIFIED
    )

    public, withheld = redact(report, queue, "run")
    assert withheld.amendments == 1
    assert public.amendments == []


def test_declining_a_statement_writes_no_negative_fixture(queue, tmp_path):
    """A fixture is a regression test against our own checker. A statement we did
    not publish is not a checker defect and must not be filed as though we had
    fixed one."""
    report, _fp = a_contested_report()
    afp = amendment_fingerprint(report.amendments[0])
    queue.decline("run", report, afp, reason=AmendmentDeclineReason.NOT_PUBLISHABLE)
    assert not (tmp_path / "suppressions").exists()


def test_declining_a_statement_does_not_delete_it(queue):
    """Append-only. The permalink stops carrying it; the log still does."""
    report, _fp = a_contested_report()
    before = list(report.amendments)
    queue.decline(
        "run",
        report,
        amendment_fingerprint(report.amendments[0]),
        reason=AmendmentDeclineReason.WITHDRAWN_BY_SENDER,
    )
    assert report.amendments == before


def test_an_amendment_fingerprint_does_not_move_when_a_checker_does():
    """A finding's identity carries the checker version so improving a check
    detaches an objection. An amendment's must not: re-queueing every statement
    because we renumbered something would silently unpublish statements a person
    had already read and released."""
    amendment = Amendment(
        finding_fingerprint="a" * 64,
        author_statement="The table is right.",
        submitted_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    moved = amendment.model_copy(update={"finding_fingerprint": "a" * 64})
    assert amendment_fingerprint(amendment) == amendment_fingerprint(moved)


def test_two_statements_saying_different_things_do_not_collide():
    at = datetime(2026, 8, 1, tzinfo=timezone.utc)
    one = Amendment(finding_fingerprint="a" * 64, author_statement="x", submitted_at=at)
    two = Amendment(finding_fingerprint="a" * 64, author_statement="y", submitted_at=at)
    assert amendment_fingerprint(one) != amendment_fingerprint(two)


def test_the_queue_holds_findings_first_then_statements(queue):
    """A reviewer cannot judge a statement without the finding it answers."""
    report, _fp = a_contested_report()
    kinds = [e.kind for e in queue.pending("run", report)]
    assert kinds == [ReviewKind.FINDING, ReviewKind.AMENDMENT]


def test_a_queued_statement_never_carries_a_name_we_were_told(queue):
    """There is no auth layer. A self-declared name printed beside a statement on
    a named researcher's page is an attribution nobody could defend."""
    report, _fp = a_contested_report()
    entry = queue.pending("run", report)[1]
    assert entry.submitter == "Sender not identified"
    assert entry.statement == "The table is right."


# --------------------------------------------------------------------------
# The queue
# --------------------------------------------------------------------------


def test_the_queue_keeps_released_items(queue):
    """A list that empties as decisions are made cannot answer "who released this,
    and when"."""
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.release("run", report, fp, by="reviewer")

    items = queue.pending("run", report)
    assert len(items) == 1
    assert items[0].state is ReviewState.RELEASED
    assert items[0].decided_by == "reviewer"
    assert items[0].decided_at is not None
    assert queue.held_count("run", report) == 0


def test_a_queue_item_carries_enough_to_decide_without_opening_the_report(queue):
    entry = queue.pending("run", a_report())[0]
    assert entry.claimed == "87.4"
    assert entry.computed == "84.1"
    assert entry.locator == 'Table 3, row 2, column "Ours"'
    assert entry.checker == "bold_extreme"
    assert entry.policy_version == "1"


# --------------------------------------------------------------------------
# Copy (§7)
# --------------------------------------------------------------------------


def test_the_held_notice_is_absent_when_nothing_is_held():
    """A page that always carried the sentence would make every clean report look
    qualified."""
    assert held_notice(0) == ""


def test_the_held_notice_reads_as_a_normal_state():
    for n in (1, 4):
        sentence = held_notice(n)
        assert sentence
        assert sentence[0].isupper() and sentence[1:] == sentence[1:]
        for forbidden in ("error", "problem", "misconduct", "failed", "warning"):
            assert forbidden not in sentence.lower()


def test_the_notice_names_both_kinds_when_both_are_held():
    sentence = held_notice(Withheld(findings=2, amendments=1))
    assert "findings" in sentence
    assert "statement" in sentence


def test_the_notice_never_says_an_author_objected():
    """We do not know that anyone who sent a statement is an author, and we have
    not decided anything about it. The line says only that something arrived and
    has not been read."""
    sentence = held_notice(Withheld(amendments=3))
    for forbidden in ("author", "objection", "complaint", "rejected", "disputed"):
        assert forbidden not in sentence.lower()


def test_every_decline_reason_has_a_label_that_judges_no_paper():
    """Declining to publish a statement says nothing about whether the statement
    is true, and nothing about the paper. The labels must not let it read as
    though it did."""
    for reason in AmendmentDeclineReason:
        label = DECLINE_LABEL[reason]
        assert label and label[0].isupper()
        for forbidden in ("false", "wrong", "invalid", "misconduct", "error"):
            assert forbidden not in label.lower()


def test_every_suppression_reason_has_a_label_about_what_we_got_wrong():
    for reason in SuppressionReason:
        label = SUPPRESSION_LABEL[reason]
        assert label
        # Sentence case, and about our reading rather than the author's conduct.
        assert label[0].isupper()
        for forbidden in ("error", "misconduct", "fraud", "bug"):
            assert forbidden not in label.lower()


# --------------------------------------------------------------------------
# Negative fixtures
# --------------------------------------------------------------------------


def test_suppressing_writes_a_negative_fixture(queue, tmp_path):
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.suppress(
        "run",
        report,
        fp,
        reason=SuppressionReason.COMPARISON_SET_WRONG,
        note="The block boundary is a \\specialrule the parser did not read.",
        by="reviewer",
    )

    written = list((tmp_path / "suppressions").glob("*.json"))
    assert len(written) == 1
    payload = json.loads(written[0].read_text(encoding="utf-8"))
    assert payload["finding_fingerprint"] == fp
    assert payload["reason"] == "comparison_set_wrong"
    assert payload["checker"] == "bold_extreme"
    assert payload["checker_version"] == "1"
    assert payload["claimed"] == "87.4"
    assert payload["computed"] == "84.1"


def test_a_negative_fixture_does_not_keep_our_prose_about_a_finding_we_withdrew(
    queue, tmp_path
):
    """`explanation` is our sentence about a finding we have just agreed was
    wrong. What must not recur is the comparison, and that is what is stored."""
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.suppress("run", report, fp, reason=SuppressionReason.VALUE_MISREAD)
    payload = json.loads(next((tmp_path / "suppressions").glob("*.json")).read_text())
    assert "explanation" not in payload
    assert "highest value" not in json.dumps(payload)


def test_suppressing_the_same_finding_twice_writes_one_fixture(queue, tmp_path):
    """The filename is derived from the fingerprint, so a re-decision replaces the
    record rather than accumulating near-duplicates that all describe one mistake."""
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.suppress("run", report, fp, reason=SuppressionReason.VALUE_MISREAD)
    queue.suppress("run", report, fp, reason=SuppressionReason.TOLERANCE_TOO_TIGHT)
    assert len(list((tmp_path / "suppressions").glob("*.json"))) == 1


def test_every_committed_suppression_is_a_usable_regression_record():
    """The permanent half of the gate.

    Every suppression under `fixtures/suppressions/` is a finding this system once
    made in error. This asserts each one carries what a regression test needs: the
    fingerprint that must not come back, and the checker and version that produced
    it. An empty directory is the expected state of a system that has not yet been
    wrong in public.
    """
    for payload in read_negative_fixtures(SUPPRESSIONS_DIR):
        for key in ("finding_fingerprint", "checker", "checker_version", "reason"):
            assert payload.get(key), f"suppression fixture missing {key}: {payload}"
        assert len(payload["finding_fingerprint"]) == 64
        # The reason must still be one we recognise: a suppression whose reason
        # has been renamed out of the enum is a record nobody can act on.
        SuppressionReason(payload["reason"])


# --------------------------------------------------------------------------
# The endpoints
# --------------------------------------------------------------------------


# The operator key these tests authenticate with. Everything on the gate needs
# it — the reads as much as the decisions, because reading the queue is reading
# exactly what release withholds.
SECRET = "test-operator-key"


@pytest.fixture
def app_under_test(tmp_path):
    def forbidden(*args, **kwargs):
        raise AssertionError("this test tried to reach the network; runs here must be offline")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("pv.ingest.fetch._download", forbidden)
        mp.setattr("pv.adapters.http.HttpxClient", forbidden)
        mp.setenv("HTTP_BACKEND", "offline")
        mp.setenv(SECRET_ENV, SECRET)
        mp.setattr(
            app_module,
            "settings",
            Settings(fixtures_dir=FIXTURES, offline=True, llm_enabled=False),
        )
        mp.setattr(app_module, "store", RunStore(max_runs=20))
        mp.setattr(app_module, "amendments", AmendmentStore())
        mp.setattr(
            app_module, "review", ReviewQueue(suppressions_dir=tmp_path / "suppressions")
        )
        yield app_module


@pytest.fixture
def client(app_under_test):
    """The operator. Presents the key on every request."""
    with TestClient(app_under_test.app, headers={HEADER: SECRET}) as c:
        yield c


@pytest.fixture
def anonymous(app_under_test):
    """A caller with no credential, sharing the store with `client`.

    Both fixtures resolve the same `app_under_test`, so a finding seeded through
    one is visible to the other — which is the only way to ask whether the gate
    actually holds it back from a stranger.
    """
    with TestClient(app_under_test.app) as c:
        yield c


def seed_run(check: CheckResult | None = None) -> tuple[str, str]:
    """A run holding one check, without driving the pipeline. Returns the run id
    and the fingerprint of its first finding, or "" when it has none."""
    check = check or a_check([a_finding()])
    record = app_module.store.create("0000.00000", [])
    record.append_check(check)
    fp = finding_fingerprint(check, check.findings[0]) if check.findings else ""
    return record.run_id, fp


def test_the_public_permalink_withholds_by_default(client):
    run_id, _fp = seed_run()
    body = client.get(f"/runs/{run_id}/report/public").json()
    assert body["held"] == 1
    assert body["report"]["checks"] == []
    assert body["notice"]


def test_the_working_report_shows_what_the_permalink_withholds(client):
    """The gate governs publication, not the record."""
    run_id, _fp = seed_run()
    full = client.get(f"/runs/{run_id}/report").json()
    assert len(full["checks"]) == 1
    assert full["checks"][0]["findings"][0]["claimed"] == "87.4"


# --------------------------------------------------------------------------
# The gate bypass
#
# `GET /runs/{id}/report` was unauthenticated *and* unredacted while
# `/report/public` beside it was redacted. Anyone who changed one path segment
# read every finding the gate was holding, about every named researcher in the
# store. The docstring on the route called it "the working surface, not the
# permalink" — a statement of intent standing in for a control, which CLAUDE.md
# names as this codebase's recurring defect.
#
# These tests are the control. Each one seeds a *held* finding and then asks an
# unauthenticated caller for it by every route that carries one.
# --------------------------------------------------------------------------


def test_the_working_report_does_not_open_for_a_stranger(client, anonymous):
    """The bypass, closed. The value `87.4` is the held finding's claimed value:
    if it appears anywhere in an anonymous response body, the gate is decorative."""
    run_id, _fp = seed_run()

    # The operator sees it — the gate withholds publication, not the record.
    assert client.get(f"/runs/{run_id}/report").json()["checks"][0]["findings"][0][
        "claimed"
    ] == "87.4"

    response = anonymous.get(f"/runs/{run_id}/report")
    assert response.status_code == 401
    assert "87.4" not in response.text


@pytest.mark.parametrize(
    "path",
    [
        # Every route that carries an unredacted finding. The report endpoint was
        # the one the audit found; the rest are the same bytes one segment away,
        # and closing only the first would have moved the bypass rather than
        # ending it.
        "/runs/{run_id}/report",
        "/runs/{run_id}",
        "/runs/{run_id}/stream",
        "/runs/{run_id}/review",
        "/runs/{run_id}/findings",
    ],
)
def test_no_route_hands_a_held_finding_to_an_anonymous_caller(
    client, anonymous, path
):
    run_id, _fp = seed_run()
    response = anonymous.get(path.format(run_id=run_id))
    assert response.status_code == 401
    assert "87.4" not in response.text


def test_the_run_list_does_not_tell_a_stranger_a_divergence_exists(client, anonymous):
    """The counts are a smaller leak than the finding, not a different one: a row
    reading `1 diverges` says we have an unpublished accusation about this paper."""
    seed_run()
    assert anonymous.get("/runs").status_code == 401


def test_a_stranger_cannot_release_a_held_finding(client, anonymous):
    """The worst of the four. Releasing is what puts a claim about a named
    researcher on a public URL, and it was one unauthenticated POST."""
    run_id, fp = seed_run()

    assert anonymous.post(f"/runs/{run_id}/review/{fp}/release", json={}).status_code == 401
    # Still held, and still off the permalink.
    assert client.get(f"/runs/{run_id}/report/public").json()["held"] == 1
    assert client.get(f"/runs/{run_id}/report/public").json()["report"]["checks"] == []


def test_a_stranger_cannot_suppress_a_finding_or_write_a_negative_fixture(
    client, anonymous, tmp_path
):
    """Suppression has the longest reach of anything in this API: the negative
    fixture it writes is read back by `read_negative_fixtures`, so an open
    suppress endpoint was a way to write into the regression suite from the open
    internet."""
    run_id, fp = seed_run()

    response = anonymous.post(
        f"/runs/{run_id}/review/{fp}/suppress",
        json={"reason": "metric_direction_wrong", "note": "not from us"},
    )
    assert response.status_code == 401
    assert not list((tmp_path / "suppressions").glob("*.json"))
    # And the finding is untouched: still held, not suppressed.
    assert client.get(f"/runs/{run_id}/review").json()["items"][0]["state"] == "held"


def test_the_permalink_is_the_one_route_a_stranger_may_read(client, anonymous):
    """Redacted, and open. That pairing is the whole design — the version that
    needs no credential is the version with the held findings taken out."""
    run_id, _fp = seed_run()
    response = anonymous.get(f"/runs/{run_id}/report/public")
    assert response.status_code == 200
    assert response.json()["report"]["checks"] == []
    assert "87.4" not in response.text


def test_a_released_finding_reaches_a_stranger_through_the_permalink(
    client, anonymous
):
    """The gate is a gate, not a wall. Once a person has read a finding and
    released it, the permalink carries it to a reader with no credential — which
    is the point of publishing at all."""
    run_id, fp = seed_run()
    assert client.post(f"/runs/{run_id}/review/{fp}/release", json={}).status_code == 200

    body = anonymous.get(f"/runs/{run_id}/report/public").json()
    assert body["held"] == 0
    assert body["report"]["checks"][0]["findings"][0]["claimed"] == "87.4"


# --------------------------------------------------------------------------
# The audit trail
# --------------------------------------------------------------------------


def test_the_decision_records_the_principal_not_a_name_the_caller_typed(client):
    """`decided_by` used to be read from the request body, so the record of who
    released a finding said whatever the releaser felt like typing.

    With a shared key the only true statement available is "somebody holding the
    operator key", and that is what is recorded. A body that still tries to
    declare a name is ignored rather than honoured.
    """
    from pv.api.security import DEFAULT_OPERATOR_LABEL

    run_id, fp = seed_run()
    body = client.post(
        f"/runs/{run_id}/review/{fp}/release", json={"decided_by": "someone else"}
    ).json()

    assert body["decided_by"] == DEFAULT_OPERATOR_LABEL
    assert body["decided_by"] != "someone else"


def test_the_operator_label_is_configurable_for_a_named_deployment(
    app_under_test, monkeypatch
):
    """A single-operator deployment may name itself. A *request* may not name
    itself, which is the distinction that matters."""
    monkeypatch.setenv("PV_OPERATOR_LABEL", "Michael")
    with TestClient(app_under_test.app, headers={HEADER: SECRET}) as c:
        run_id, fp = seed_run()
        body = c.post(f"/runs/{run_id}/review/{fp}/release", json={}).json()
        assert body["decided_by"] == "Michael"


def test_releasing_a_finding_publishes_it(client):
    run_id, fp = seed_run()
    response = client.post(
        f"/runs/{run_id}/review/{fp}/release", json={"decided_by": "reviewer"}
    )
    assert response.status_code == 200
    assert response.json()["state"] == "released"

    body = client.get(f"/runs/{run_id}/report/public").json()
    assert body["held"] == 0
    assert body["notice"] == ""
    assert body["report"]["checks"][0]["findings"][0]["claimed"] == "87.4"


def test_suppressing_requires_a_reason(client):
    run_id, fp = seed_run()
    assert client.post(f"/runs/{run_id}/review/{fp}/suppress", json={}).status_code == 422


def test_suppressing_keeps_it_off_the_permalink_and_writes_a_fixture(client, tmp_path):
    run_id, fp = seed_run()
    response = client.post(
        f"/runs/{run_id}/review/{fp}/suppress",
        json={"reason": "metric_direction_wrong", "note": "Lower is better here."},
    )
    assert response.status_code == 200
    assert response.json()["reason"] == "metric_direction_wrong"

    assert client.get(f"/runs/{run_id}/report/public").json()["report"]["checks"] == []
    assert len(list((tmp_path / "suppressions").glob("*.json"))) == 1


def test_the_review_queue_lists_what_is_held(client):
    run_id, fp = seed_run()
    body = client.get(f"/runs/{run_id}/review").json()
    assert body["held"] == 1
    assert [i["fingerprint"] for i in body["items"]] == [fp]
    assert body["items"][0]["state"] == "held"


def test_a_run_with_nothing_to_review_has_an_empty_queue_and_a_full_permalink(client):
    run_id, _fp = seed_run(a_clean_check())
    assert client.get(f"/runs/{run_id}/review").json() == {
        "run_id": run_id,
        "arxiv_id": "0000.00000",
        "items": [],
        "held": 0,
        "held_findings": 0,
        "held_amendments": 0,
    }
    public = client.get(f"/runs/{run_id}/report/public").json()
    assert len(public["report"]["checks"]) == 1
    assert public["notice"] == ""


def test_deciding_on_a_finding_this_run_does_not_hold_is_a_404(client):
    run_id, _fp = seed_run()
    assert client.post(f"/runs/{run_id}/review/{'0' * 64}/release", json={}).status_code == 404


def test_the_public_report_of_a_run_we_never_issued_is_a_404(client):
    assert client.get("/runs/nope/report/public").status_code == 404


def seed_amendment(client, run_id: str, fp: str, statement: str = "The table is right.") -> str:
    """File a statement through the endpoint and return its review fingerprint."""
    response = client.post(
        f"/runs/{run_id}/amendments",
        json={"finding_fingerprint": fp, "author_statement": statement},
    )
    assert response.status_code == 201
    return amendment_fingerprint(Amendment.model_validate(response.json()))


def test_filing_a_statement_changes_nothing_a_reader_sees(client):
    """Anyone can reach this endpoint. Until a person has read what arrived, the
    permalink shows what the run found and nothing else."""
    run_id, fp = seed_run()
    client.post(f"/runs/{run_id}/review/{fp}/release", json={})
    before = client.get(f"/runs/{run_id}/report/public").json()

    seed_amendment(client, run_id, fp)
    after = client.get(f"/runs/{run_id}/report/public").json()

    assert after["report"]["checks"] == before["report"]["checks"]
    assert after["report"]["amendments"] == []
    assert after["held_amendments"] == 1
    assert after["held_findings"] == 0


def test_a_statement_cannot_bury_a_released_finding(client):
    """The attack this asymmetry closes: with no auth layer, a contest that
    suppressed a finding would let anyone erase a true one."""
    run_id, fp = seed_run()
    client.post(f"/runs/{run_id}/review/{fp}/release", json={})
    for i in range(3):
        seed_amendment(client, run_id, fp, statement=f"objection {i}")

    body = client.get(f"/runs/{run_id}/report/public").json()
    assert body["report"]["checks"][0]["findings"][0]["claimed"] == "87.4"
    assert body["held_amendments"] == 3


def test_a_statement_lands_in_the_same_queue_as_a_divergence(client):
    run_id, fp = seed_run()
    afp = seed_amendment(client, run_id, fp)

    body = client.get(f"/runs/{run_id}/review").json()
    assert body["held_findings"] == 1
    assert body["held_amendments"] == 1
    kinds = {i["kind"]: i for i in body["items"]}
    assert set(kinds) == {"finding", "amendment"}
    assert kinds["amendment"]["fingerprint"] == afp
    assert kinds["amendment"]["contests"] == fp
    assert kinds["amendment"]["submitter"] == "Sender not identified"


def test_releasing_a_statement_publishes_it(client):
    run_id, fp = seed_run()
    afp = seed_amendment(client, run_id, fp)

    response = client.post(
        f"/runs/{run_id}/review/amendments/{afp}/release", json={"decided_by": "reviewer"}
    )
    assert response.status_code == 200
    assert response.json()["state"] == "released"

    body = client.get(f"/runs/{run_id}/report/public").json()
    assert body["held_amendments"] == 0
    assert body["report"]["amendments"][0]["author_statement"] == "The table is right."
    # Releasing the statement released nothing else.
    assert body["held_findings"] == 1
    assert body["report"]["checks"] == []


def test_declining_a_statement_requires_a_reason(client):
    run_id, fp = seed_run()
    afp = seed_amendment(client, run_id, fp)
    assert (
        client.post(f"/runs/{run_id}/review/amendments/{afp}/decline", json={}).status_code
        == 422
    )


def test_declining_a_statement_keeps_it_off_the_permalink_and_in_the_log(client, tmp_path):
    run_id, fp = seed_run()
    afp = seed_amendment(client, run_id, fp)

    response = client.post(
        f"/runs/{run_id}/review/amendments/{afp}/decline",
        json={"reason": "authorship_unverified"},
    )
    assert response.status_code == 200
    assert response.json()["reason"] == "authorship_unverified"

    assert client.get(f"/runs/{run_id}/report/public").json()["report"]["amendments"] == []
    # Append-only: the working surface still carries it.
    assert len(client.get(f"/runs/{run_id}/amendments").json()["amendments"]) == 1
    # A declined statement is not a checker defect and writes no fixture.
    assert not (tmp_path / "suppressions").exists()


def test_a_finding_release_does_not_release_the_statement_against_it(client):
    run_id, fp = seed_run()
    seed_amendment(client, run_id, fp)
    client.post(f"/runs/{run_id}/review/{fp}/release", json={})

    body = client.get(f"/runs/{run_id}/report/public").json()
    assert len(body["report"]["checks"]) == 1
    assert body["report"]["amendments"] == []
    assert body["held_amendments"] == 1


def test_releasing_an_amendment_fingerprint_on_the_finding_route_is_a_404(client):
    """The two routes address two different kinds. Crossing them must not
    accidentally publish either."""
    run_id, fp = seed_run()
    afp = seed_amendment(client, run_id, fp)
    assert client.post(f"/runs/{run_id}/review/{afp}/release", json={}).status_code == 404


def test_an_unverifiable_result_is_never_held(client):
    """Roughly half of all real rows are unverifiable and they are the product
    working, not an accusation. Queueing them behind a human would bury §5.5."""
    run_id, _fp = seed_run(
        CheckResult(
            checker="citation_existence",
            checker_version="1",
            verdict=Verdict.UNVERIFIABLE,
            reason=ReasonCode.REFERENCE_NOT_INDEXED,
        )
    )
    assert client.get(f"/runs/{run_id}/review").json()["held"] == 0
    assert len(client.get(f"/runs/{run_id}/report/public").json()["report"]["checks"]) == 1
