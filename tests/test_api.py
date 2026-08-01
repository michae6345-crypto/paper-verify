"""API tests. Every run is driven from `fixtures/papers/`, so nothing here
touches the network: `PV_FIXTURES_DIR` makes ingest read the tree from disk and
`HTTP_BACKEND=offline` keeps the link and citation checks off the wire.

What the suite is actually protecting:
  - the stream emits one event per check, in manifest order, and terminates;
  - a paper we could not read comes back as a report, never a 500;
  - the OpenAPI schema carries the contract models, because the frontend's
    TypeScript is generated from it.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pv.api import app as app_module
from pv.api import jobs
from pv.api.config import Settings
from pv.api.store import RunStore
from pv.models import RunReport, Verdict
from pv.run import run_paper

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "papers"
PAPER = "1706.03762"  # the Transformer paper — the canonical end-to-end case
EXPECTED_CHECKS = ["bold_extreme", "row_arithmetic", "dead_links", "citation_existence"]


@pytest.fixture(autouse=True)
def offline_app(monkeypatch):
    """Point the app at the fixture corpus and give each test a fresh store."""
    monkeypatch.setenv("HTTP_BACKEND", "offline")
    monkeypatch.setattr(
        app_module,
        "settings",
        Settings(fixtures_dir=FIXTURES, offline=True, llm_enabled=False),
    )
    monkeypatch.setattr(app_module, "store", RunStore(max_runs=50))
    return app_module


@pytest.fixture
def client(offline_app):
    with TestClient(offline_app.app) as c:
        yield c


def read_events(response) -> list[tuple[str, dict]]:
    """Parse an SSE body into (event name, data) pairs, ignoring keep-alive comments."""
    events: list[tuple[str, dict]] = []
    name: str | None = None
    for line in response.text.splitlines():
        if line.startswith(":") or not line.strip():
            name = name if line.startswith(":") else None
            continue
        field, _, value = line.partition(":")
        value = value.lstrip()
        if field == "event":
            name = value
        elif field == "data" and name is not None:
            events.append((name, json.loads(value)))
    return events


# --------------------------------------------------------------------------
# POST /runs
# --------------------------------------------------------------------------


def test_create_run_returns_id_and_manifest(client):
    resp = client.post("/runs", json={"arxiv_id": PAPER})
    assert resp.status_code == 202
    body = resp.json()

    assert body["run_id"]
    assert body["arxiv_id"] == PAPER
    # The manifest is the whole list of intended checks, known up front — it is
    # what the UI derives `pending` from.
    assert [c["checker"] for c in body["manifest"]["checks"]] == EXPECTED_CHECKS
    assert all(c["display_name"] for c in body["manifest"]["checks"])


@pytest.mark.parametrize(
    "given",
    ["1706.03762", "1706.03762v5", "https://arxiv.org/abs/1706.03762", "arXiv:1706.03762"],
)
def test_arxiv_id_is_normalised(client, given):
    body = client.post("/runs", json={"arxiv_id": given}).json()
    assert body["arxiv_id"] == PAPER


def test_run_result_matches_the_headless_runner(client):
    """The API is a surface over the runner, not a second opinion."""
    run_id = client.post("/runs", json={"arxiv_id": PAPER}).json()["run_id"]
    report = RunReport.model_validate(client.get(f"/runs/{run_id}").json()["report"])
    expected = run_paper(PAPER, from_directory=str(FIXTURES / PAPER))

    assert [c.checker for c in report.checks] == [c.checker for c in expected.checks]
    assert [c.verdict for c in report.checks] == [c.verdict for c in expected.checks]
    assert report.tables_parsed == expected.tables_parsed
    assert report.title == expected.title
    assert [n.reason for n in report.not_checked] == [n.reason for n in expected.not_checked]


def test_report_endpoint_returns_the_bare_contract_type(client):
    run_id = client.post("/runs", json={"arxiv_id": PAPER}).json()["run_id"]
    report = RunReport.model_validate(client.get(f"/runs/{run_id}/report").json())
    assert report.arxiv_id == PAPER
    assert report.finished_at is not None


def test_status_is_complete_and_checks_are_terminal(client):
    run_id = client.post("/runs", json={"arxiv_id": PAPER}).json()["run_id"]
    body = client.get(f"/runs/{run_id}").json()
    assert body["status"] == "complete"
    # Append-only: nothing pending or running is ever stored as a result.
    assert all(c["verdict"] in {v.value for v in Verdict} for c in body["report"]["checks"])


# --------------------------------------------------------------------------
# A run never fails as a whole
# --------------------------------------------------------------------------


def test_bad_arxiv_id_yields_a_report_not_a_500(client):
    resp = client.post("/runs", json={"arxiv_id": "not-a-paper"})
    assert resp.status_code == 202
    run_id = resp.json()["run_id"]

    body = client.get(f"/runs/{run_id}").json()
    assert body["status"] == "complete"
    report = RunReport.model_validate(body["report"])
    assert report.checks == []
    # §5.5 has to say what happened, in a reason code the UI can label.
    assert [n.reason for n in report.not_checked] == ["no_latex_source"]
    assert report.not_checked[0].detail


def test_paper_with_no_source_yields_a_report(client):
    """A well-formed id we have no source for is still a valid run."""
    run_id = client.post("/runs", json={"arxiv_id": "2401.00001"}).json()["run_id"]
    report = RunReport.model_validate(client.get(f"/runs/{run_id}/report").json())
    assert report.not_checked
    assert report.not_checked[0].reason.value in {"no_latex_source", "network_error"}


def test_unknown_run_id_is_404(client):
    """A run id we never issued *is* a client error — unlike a paper we could
    not check, which is a report."""
    assert client.get("/runs/deadbeef").status_code == 404
    assert client.get("/runs/deadbeef/stream").status_code == 404


# --------------------------------------------------------------------------
# GET /runs
# --------------------------------------------------------------------------


def test_recent_runs_are_listed_most_recent_first(client):
    first = client.post("/runs", json={"arxiv_id": PAPER}).json()["run_id"]
    second = client.post("/runs", json={"arxiv_id": "1409.1556"}).json()["run_id"]

    runs = client.get("/runs").json()["runs"]
    assert [r["run_id"] for r in runs] == [second, first]

    row = runs[1]
    assert row["arxiv_id"] == PAPER
    assert row["status"] == "complete"
    assert len(row["verdicts"]) == len(EXPECTED_CHECKS)
    assert row["tables_parsed"] > 0


def test_recent_runs_respects_limit(client):
    for _ in range(3):
        client.post("/runs", json={"arxiv_id": PAPER})
    assert len(client.get("/runs", params={"limit": 2}).json()["runs"]) == 2


# --------------------------------------------------------------------------
# SSE
# --------------------------------------------------------------------------


def test_stream_emits_manifest_then_one_event_per_check_then_done(client):
    run_id = client.post("/runs", json={"arxiv_id": PAPER}).json()["run_id"]

    with client.stream("GET", f"/runs/{run_id}/stream") as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        resp.read()
        events = read_events(resp)

    names = [name for name, _ in events]
    assert names == ["manifest"] + ["check"] * len(EXPECTED_CHECKS) + ["done"]

    manifest = events[0][1]
    assert [c["checker"] for c in manifest["checks"]] == EXPECTED_CHECKS

    # One event per check, in manifest order, each carrying its manifest index.
    checks = [payload for name, payload in events if name == "check"]
    assert [c["index"] for c in checks] == list(range(len(EXPECTED_CHECKS)))
    assert [c["result"]["checker"] for c in checks] == EXPECTED_CHECKS
    assert all(c["run_id"] == run_id for c in checks)

    # The terminal event carries the complete run, including the run-level
    # "not checked" list that no single check can produce.
    done = events[-1][1]
    assert done["run"]["status"] == "complete"
    assert len(done["run"]["report"]["checks"]) == len(EXPECTED_CHECKS)


def test_a_finished_run_still_replays_the_whole_stream(client):
    """Connecting late shows the whole run, not the tail of it. Only possible
    because results are append-only."""
    run_id = client.post("/runs", json={"arxiv_id": PAPER}).json()["run_id"]
    first = read_events(client.get(f"/runs/{run_id}/stream"))
    second = read_events(client.get(f"/runs/{run_id}/stream"))
    assert [n for n, _ in first] == [n for n, _ in second]


@pytest.mark.asyncio
async def test_stream_delivers_each_check_while_the_run_is_in_flight(offline_app):
    """Events must arrive as the work happens, not in one lump at the end.

    Driven at the ASGI level because the test transports buffer the whole body,
    which is exactly the failure mode this test exists to rule out. Each response
    body is recorded together with the run's status at the moment it was sent: if
    the stream only flushed at the end, every check would be stamped `complete`.
    """
    record = offline_app.store.create(PAPER, jobs.manifest_checks())
    path = f"/runs/{record.run_id}/stream"
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"testserver"), (b"accept", b"text/event-stream")],
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
    }
    sent: list[tuple[str, str]] = []

    async def receive():
        await asyncio.sleep(30)  # the client never disconnects
        return {"type": "http.disconnect"}

    async def send(message):
        if message["type"] == "http.response.body" and message.get("body"):
            sent.append((message["body"].decode(), record.status.value))

    stream = asyncio.create_task(offline_app.app(scope, receive, send))
    await asyncio.sleep(0.05)  # let the stream open and replay the manifest
    await jobs.execute(record, offline_app.settings)
    await asyncio.wait_for(stream, timeout=15)

    events = [(body, status) for body, status in sent if body.startswith("event:")]
    names = [body.split("\r\n")[0].split(":", 1)[1].strip() for body, _ in events]
    assert names == ["manifest"] + ["check"] * len(EXPECTED_CHECKS) + ["done"]

    # Each check went out while the run was still going, rather than being held
    # back to the end. The last one is exempt: nothing awaits between the final
    # result and `finish`, so it legitimately races the terminal event.
    check_statuses = [status for name, (_, status) in zip(names, events) if name == "check"]
    assert check_statuses[:-1] == ["running"] * (len(EXPECTED_CHECKS) - 1)


# --------------------------------------------------------------------------
# §5.2 repositories
# --------------------------------------------------------------------------


def test_repositories_returns_artifacts_best_first(client):
    resp = client.get(f"/papers/{PAPER}/repositories")
    assert resp.status_code == 200
    artifacts = resp.json()
    assert artifacts, "the Transformer paper links tensorflow/tensor2tensor"
    assert artifacts[0]["path"] == "tensorflow/tensor2tensor"
    assert artifacts[0]["confidence"] > 0
    # Offline: no metadata lookup, so stars stay unset rather than wrong.
    assert artifacts[0]["stars"] is None
    assert [a["confidence"] for a in artifacts] == sorted(
        (a["confidence"] for a in artifacts), reverse=True
    )


def test_repositories_for_an_unreadable_paper_is_empty_not_an_error(client):
    """"Continue without code" is a legitimate path — an empty list, not a 500."""
    assert client.get("/papers/not-a-paper/repositories").json() == []
    assert client.get("/papers/2401.00001/repositories").json() == []


# --------------------------------------------------------------------------
# Contract
# --------------------------------------------------------------------------


def test_openapi_exposes_the_contract_models(client):
    schema = client.get("/openapi.json").json()
    components = schema["components"]["schemas"]
    for name in (
        "RunReport",
        "CheckResult",
        "Finding",
        "Anchor",
        "NotChecked",
        "Artifact",
        "Verdict",
        "ReasonCode",
        "Severity",
    ):
        assert name in components, f"{name} missing from the generated schema"

    # Every reason code and verdict, so the UI can label all of them.
    from pv.models import ReasonCode

    assert set(components["ReasonCode"]["enum"]) == {r.value for r in ReasonCode}
    assert set(components["Verdict"]["enum"]) == {v.value for v in Verdict}


def test_openapi_covers_every_endpoint(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) == {
        "/runs",
        "/runs/{run_id}",
        "/runs/{run_id}/report",
        "/runs/{run_id}/stream",
        "/papers/{arxiv_id}/repositories",
    }


def test_cors_allows_the_frontend_origin(client):
    resp = client.options(
        "/runs",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_no_check_result_is_stored_with_a_non_terminal_status(client):
    """§10 is append-only: `pending` and `running` are derived from the manifest,
    so they must not appear anywhere in a stored result."""
    run_id = client.post("/runs", json={"arxiv_id": PAPER}).json()["run_id"]
    body = client.get(f"/runs/{run_id}").json()
    assert "status" not in json.dumps(body["report"])
