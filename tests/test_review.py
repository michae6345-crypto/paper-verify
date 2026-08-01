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
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pv.amendments.identity import finding_fingerprint
from pv.amendments.store import AmendmentStore
from pv.api import app as app_module
from pv.api.config import Settings
from pv.api.store import RunStore
from pv.models import Anchor, CheckResult, Finding, ReasonCode, RunReport, Severity, Verdict
from pv.review import (
    SUPPRESSION_LABEL,
    SUPPRESSIONS_DIR,
    ReleaseRequiresReview,
    ReviewQueue,
    ReviewState,
    SuppressionReason,
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
    public, held = redact(report, queue, "run")
    assert held == 1
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
    public, held = redact(a_report(check), queue, "run")
    assert held == 1
    assert len(public.checks) == 1
    assert [f.anchor.dom_id for f in public.checks[0].findings] == ["tab:main/r9/c3"]


def test_releasing_a_finding_puts_it_on_the_public_report(queue):
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.release("run", report, fp, by="reviewer")

    public, held = redact(report, queue, "run")
    assert held == 0
    assert len(public.checks) == 1
    assert public.checks[0].findings[0].claimed == "87.4"


def test_a_suppressed_finding_stays_off_the_public_report(queue):
    report = a_report()
    fp = finding_fingerprint(report.checks[0], report.checks[0].findings[0])
    queue.suppress("run", report, fp, reason=SuppressionReason.COMPARISON_SET_WRONG)

    public, held = redact(report, queue, "run")
    assert held == 1
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
    public, held = redact(report, queue, "run")
    assert held == 0
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


@pytest.fixture
def client(tmp_path):
    def forbidden(*args, **kwargs):
        raise AssertionError("this test tried to reach the network; runs here must be offline")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("pv.ingest.fetch._download", forbidden)
        mp.setattr("pv.adapters.http.HttpxClient", forbidden)
        mp.setenv("HTTP_BACKEND", "offline")
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
        with TestClient(app_module.app) as c:
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
    }
    public = client.get(f"/runs/{run_id}/report/public").json()
    assert len(public["report"]["checks"]) == 1
    assert public["notice"] == ""


def test_deciding_on_a_finding_this_run_does_not_hold_is_a_404(client):
    run_id, _fp = seed_run()
    assert client.post(f"/runs/{run_id}/review/{'0' * 64}/release", json={}).status_code == 404


def test_the_public_report_of_a_run_we_never_issued_is_a_404(client):
    assert client.get("/runs/nope/report/public").status_code == 404


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
