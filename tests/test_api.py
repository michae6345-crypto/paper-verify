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
from pv.api.security import COOKIE, HEADER, SECRET_ENV
from pv.api.store import RunStore
from pv.models import ReasonCode, RunReport, Verdict
from pv.orchestrator import MemoryStateStore, Orchestrator, RunStage
from pv.run import run_paper

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "papers"
PAPER = "1706.03762"  # the Transformer paper — the canonical end-to-end case
EXPECTED_CHECKS = ["bold_extreme", "row_arithmetic", "dead_links", "citation_existence"]

# The operator key the suite authenticates with. Every route except `/health` and
# the redacted permalink needs it, so the shared `client` fixture presents it on
# every request and the tests that care about *absence* use `anonymous` below.
SECRET = "test-operator-key"


@pytest.fixture(scope="module", autouse=True)
def offline_app():
    """The app, pointed at the fixture corpus, with the network nailed shut.

    Fail loudly if anything here tries to leave the machine.

    arXiv allows one request every three seconds and bans for abuse (CLAUDE.md),
    and a test suite is the worst possible offender because it runs constantly.
    A stray request is otherwise invisible — it does not fail anything, it just
    makes the suite slower, which is how one survived here until it was timed.

    Both egress points are stubbed rather than merely configured off, so the
    suite cannot regress into making requests without a test failing:
      - `fetch._download`, the only place ingest talks to arXiv;
      - `adapters.http.HttpxClient`, which `get_http_client` builds unless
        `HTTP_BACKEND=offline`, and which the link and citation checks use.

    `offline=True` is what makes ingest pass `allow_network=False`, so a paper
    with no fixture and no cache entry resolves to `network_error` immediately
    instead of fetching. The guards above are the proof that it does.
    """

    def forbidden(*args, **kwargs):
        raise AssertionError(
            "this test tried to reach the network; runs here must be offline"
        )

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("pv.ingest.fetch._download", forbidden)
        mp.setattr("pv.adapters.http.HttpxClient", forbidden)
        mp.setenv("HTTP_BACKEND", "offline")
        # Without this the gated routes answer 503 rather than 401: an unset
        # secret is closed, not open. See `pv.api.security`.
        mp.setenv(SECRET_ENV, SECRET)
        mp.setattr(
            app_module,
            "settings",
            Settings(fixtures_dir=FIXTURES, offline=True, llm_enabled=False),
        )
        mp.setattr(app_module, "store", RunStore(max_runs=50))
        # Its own orchestrator, with its own state store: run state outlives a
        # single test otherwise, and a resumable run is exactly the kind that does.
        mp.setattr(app_module, "orchestrator", Orchestrator(store=MemoryStateStore()))
        yield app_module


@pytest.fixture(scope="module")
def client(offline_app):
    """Authenticated. Presents the operator key on every request."""
    with TestClient(offline_app.app, headers={HEADER: SECRET}) as c:
        yield c


@pytest.fixture(scope="module")
def anonymous(offline_app):
    """A caller with no credential — the one on the open internet.

    A separate client rather than a header stripped per request, because a test
    proving a route is closed must not be one `headers=` argument away from
    silently testing the authenticated path instead.
    """
    with TestClient(offline_app.app) as c:
        yield c


@pytest.fixture(scope="module")
def created(client) -> dict:
    """One completed run of the Transformer paper, shared by every read-only test.

    Checking a real paper costs about a second. Twenty of them is the difference
    between a suite people run and a suite people skip, and none of these tests
    needs its *own* run — the results are append-only, so a finished run answers
    every question about it as well as a fresh one would.

    Posted as a URL so the endpoint's id normalisation is exercised here too.
    """
    resp = client.post("/runs", json={"arxiv_id": f"https://arxiv.org/abs/{PAPER}"})
    assert resp.status_code == 202
    return resp.json()


@pytest.fixture(scope="module")
def run_id(created) -> str:
    return created["run_id"]


@pytest.fixture
def own_store(offline_app):
    """A private store, for the tests that assert over the whole run list."""
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(offline_app, "store", RunStore(max_runs=50))
        yield


async def _until(predicate, timeout: float = 30.0) -> None:
    """Wait for a condition the driver reaches on its own. Polled rather than
    slept for, so the test is not a race on a fixed duration."""
    deadline = asyncio.get_running_loop().time() + timeout
    while not predicate():
        if asyncio.get_running_loop().time() > deadline:
            raise AssertionError("the run never reached the expected state")
        await asyncio.sleep(0.02)


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


def test_create_run_returns_id_and_manifest(created):
    assert created["run_id"]
    # Posted as an arXiv URL; the id comes back normalised.
    assert created["arxiv_id"] == PAPER
    # The manifest is the whole list of intended checks, known up front — it is
    # what the UI derives `pending` from.
    assert [c["checker"] for c in created["manifest"]["checks"]] == EXPECTED_CHECKS
    assert all(c["display_name"] for c in created["manifest"]["checks"])


@pytest.mark.parametrize(
    "given",
    ["1706.03762", "1706.03762v5", "https://arxiv.org/abs/1706.03762", "arXiv:1706.03762"],
)
def test_arxiv_id_is_normalised(given):
    """Normalisation is a pure function; the endpoint wiring is covered by
    `created`, which posts a URL. Running a paper per form would cost four
    seconds to test a regex."""
    arxiv_id, _version, error = jobs.normalize_id(given)
    assert (arxiv_id, error) == (PAPER, None)


def test_run_result_matches_the_headless_runner(client, run_id):
    """The API is a surface over the runner, not a second opinion."""
    report = RunReport.model_validate(client.get(f"/runs/{run_id}").json()["report"])
    expected = run_paper(PAPER, from_directory=str(FIXTURES / PAPER))

    assert [c.checker for c in report.checks] == [c.checker for c in expected.checks]
    assert [c.verdict for c in report.checks] == [c.verdict for c in expected.checks]
    assert report.tables_parsed == expected.tables_parsed
    assert report.title == expected.title
    assert [n.reason for n in report.not_checked] == [n.reason for n in expected.not_checked]


def test_report_endpoint_returns_the_bare_contract_type(client, run_id):
    report = RunReport.model_validate(client.get(f"/runs/{run_id}/report").json())
    assert report.arxiv_id == PAPER
    assert report.finished_at is not None


def test_status_is_complete_and_checks_are_terminal(client, run_id):
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
    # §5.5 has to say what happened, in a reason code the UI can label. A
    # malformed identifier is not `no_latex_source` — that means a real paper
    # that shipped no LaTeX, which reads completely differently.
    assert [n.reason for n in report.not_checked] == [ReasonCode.INVALID_PAPER_ID]
    assert report.not_checked[0].detail


def test_paper_with_no_source_yields_a_report(client):
    """A well-formed id we have no source for is still a valid run.

    Offline, an uncached paper resolves to `network_error` without a request
    going out — `no_network` would fail this test if one did.
    """
    run_id = client.post("/runs", json={"arxiv_id": "2401.00001"}).json()["run_id"]
    report = RunReport.model_validate(client.get(f"/runs/{run_id}/report").json())
    assert report.checks == []
    assert [n.reason for n in report.not_checked] == [ReasonCode.NETWORK_ERROR]


def test_the_offline_app_never_reaches_the_network(client, own_store):
    """The whole suite must be network-free; this states it as a requirement
    rather than leaving it to be noticed in the wall-clock time.

    Every path that could reach out is exercised — a cached paper, an uncached
    one, and a malformed id, through both the run and the repository endpoints.
    If any of them made a request, the guard in `offline_app` would raise.
    """
    for arxiv_id in ("2401.00001", "not-a-paper"):
        assert client.post("/runs", json={"arxiv_id": arxiv_id}).status_code == 202
        assert client.get(f"/papers/{arxiv_id}/repositories").status_code == 200
    # The fixture-backed paper goes through ingest for real; `created` already
    # ran the check pipeline for it under the same guard.
    assert client.get(f"/papers/{PAPER}/repositories").status_code == 200

    runs = client.get("/runs").json()["runs"]
    assert len(runs) == 2
    assert all(r["status"] == "complete" for r in runs)


def test_unknown_run_id_is_404(client):
    """A run id we never issued *is* a client error — unlike a paper we could
    not check, which is a report."""
    assert client.get("/runs/deadbeef").status_code == 404
    assert client.get("/runs/deadbeef/stream").status_code == 404


# --------------------------------------------------------------------------
# GET /runs
# --------------------------------------------------------------------------


def test_recent_runs_are_listed_most_recent_first(client, own_store):
    # Uncached papers: runs that finish at once, so ordering costs no parses.
    first = client.post("/runs", json={"arxiv_id": "2401.00001"}).json()["run_id"]
    second = client.post("/runs", json={"arxiv_id": "2401.00002"}).json()["run_id"]

    runs = client.get("/runs").json()["runs"]
    assert [r["run_id"] for r in runs] == [second, first]
    # A paper we could not read is still a row, with an empty verdict strip.
    assert runs[0]["verdicts"] == []
    assert runs[0]["not_checked"] == 1


def test_run_summary_carries_the_verdict_strip(client, run_id):
    """§5.1's row: enough to render the fingerprint without fetching the report."""
    row = next(r for r in client.get("/runs").json()["runs"] if r["run_id"] == run_id)
    assert row["arxiv_id"] == PAPER
    assert row["title"] == "Attention Is All You Need"
    assert row["status"] == "complete"
    assert len(row["verdicts"]) == len(EXPECTED_CHECKS)
    assert row["tables_parsed"] > 0


def test_recent_runs_respects_limit(client, own_store):
    for _ in range(3):
        client.post("/runs", json={"arxiv_id": "2401.00001"})
    assert len(client.get("/runs", params={"limit": 2}).json()["runs"]) == 2


# --------------------------------------------------------------------------
# SSE
# --------------------------------------------------------------------------


def test_stream_emits_manifest_then_one_event_per_check_then_done(client, run_id):
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


def test_a_finished_run_still_replays_the_whole_stream(client, run_id):
    """Connecting late shows the whole run, not the tail of it. Only possible
    because results are append-only."""
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
        "headers": [
            (b"host", b"testserver"),
            (b"accept", b"text/event-stream"),
            # A hand-built scope, so the credential is hand-built too.
            (HEADER.lower().encode(), SECRET.encode()),
        ],
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
# §5.2 / §14.2 — the repository confirmation state and the resume endpoint
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_run_can_pause_for_the_repository_confirmation(offline_app):
    """The state BRIEF §5.2's confirmation screen needs, and which had nowhere to
    live: `checks/repos.py` found candidates, but no state waited for a choice."""
    record = offline_app.store.create(PAPER, jobs.manifest_checks())
    orchestrator = Orchestrator(store=MemoryStateStore())
    task = asyncio.create_task(
        jobs.execute(
            record, offline_app.settings, await_artifact=True, orchestrator=orchestrator
        )
    )
    try:
        await _until(lambda: record.stage is RunStage.AWAITING_ARTIFACT)
        assert record.envelope().state is RunStage.AWAITING_ARTIFACT
        assert record.artifact_candidates[0].path == "tensorflow/tensor2tensor"

        chosen = record.artifact_candidates[0]
        orchestrator.confirm_artifact(record.run_id, chosen)
        record.confirm_artifact(chosen)
        await asyncio.wait_for(task, timeout=30)
    finally:
        task.cancel()

    assert record.status.value == "complete"
    assert record.artifact is not None and record.artifact.path == "tensorflow/tensor2tensor"


@pytest.mark.asyncio
async def test_the_paused_run_publishes_one_state_event(offline_app):
    """A client that sees no event renders a run that appears stuck. One event,
    not one per poll — the driver polls, and a stream that repeats itself three
    hundred times while nothing happens says nothing."""
    record = offline_app.store.create(PAPER, jobs.manifest_checks())
    queue, replay = record.subscribe()
    orchestrator = Orchestrator(store=MemoryStateStore())
    task = asyncio.create_task(
        jobs.execute(
            record, offline_app.settings, await_artifact=True, orchestrator=orchestrator
        )
    )
    try:
        await _until(lambda: record.stage is RunStage.AWAITING_ARTIFACT)
        await asyncio.sleep(0.3)  # several polls' worth
        orchestrator.confirm_artifact(record.run_id, None)
        record.confirm_artifact(None)
        await asyncio.wait_for(task, timeout=30)
    finally:
        task.cancel()

    events = []
    while not queue.empty():
        event = queue.get_nowait()
        if event is not None:
            events.append(event[0].value)
    assert events.count("state") == 1
    assert [name.value for name, _ in replay] == ["manifest"]


def test_the_endpoint_releases_a_waiting_run(client, offline_app):
    """The §5.2 answer, over HTTP.

    Driven to the pause by hand rather than through `POST /runs`: the test client
    runs background tasks to completion before it returns a response, so a run
    that pauses through the endpoint could never be answered through it.
    """
    record = offline_app.store.create(PAPER, jobs.manifest_checks())
    run_id = offline_app.orchestrator.start(
        PAPER,
        opts=jobs.run_options(PAPER, offline_app.settings, await_artifact=True),
        run_id=record.run_id,
    )
    for _ in range(10):
        state = offline_app.orchestrator.advance(run_id)
        if state.is_awaiting_artifact:
            break
    record.await_artifact(state.artifact_candidates, state.artifact_deadline)

    body = client.get(f"/runs/{run_id}").json()
    assert body["state"] == "awaiting_artifact"
    assert body["artifact_candidates"][0]["path"] == "tensorflow/tensor2tensor"

    resp = client.post(
        f"/runs/{run_id}/artifact",
        json={"artifact": body["artifact_candidates"][0]},
    )
    assert resp.status_code == 200
    assert resp.json()["artifact"]["path"] == "tensorflow/tensor2tensor"
    assert resp.json()["state"] == "planning"
    # And the run really is released — it walks to a terminal state on its own.
    assert offline_app.orchestrator.drive(run_id).is_terminal


def test_continue_without_code_is_accepted_over_http(client, offline_app):
    """§5.2 calls it a legitimate path, so it is a 200 with `artifact: null`, not
    a refusal to answer."""
    record = offline_app.store.create(PAPER, jobs.manifest_checks())
    run_id = offline_app.orchestrator.start(
        PAPER,
        opts=jobs.run_options(PAPER, offline_app.settings, await_artifact=True),
        run_id=record.run_id,
    )
    for _ in range(10):
        if offline_app.orchestrator.advance(run_id).is_awaiting_artifact:
            break

    resp = client.post(f"/runs/{run_id}/artifact", json={"artifact": None})
    assert resp.status_code == 200 and resp.json()["artifact"] is None


def test_confirming_a_run_that_is_not_waiting_is_a_conflict(client, run_id):
    """The ten-minute window closed, or the run never paused. Nothing is broken
    and a report exists, so this is 409 and not 500."""
    resp = client.post(f"/runs/{run_id}/artifact", json={"artifact": None})
    assert resp.status_code == 409
    assert "not waiting" in resp.json()["detail"]


def test_confirming_an_unknown_run_is_404(client):
    assert client.post("/runs/deadbeef/artifact", json={"artifact": None}).status_code == 404


def test_a_run_created_without_confirmation_never_pauses(client, run_id):
    """Off by default: a client that will not answer must not be able to leave a
    run waiting."""
    assert client.get(f"/runs/{run_id}").json()["state"] in {"complete", "partial"}


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
    assert set(components["ReasonCode"]["enum"]) == {r.value for r in ReasonCode}
    assert set(components["Verdict"]["enum"]) == {v.value for v in Verdict}


def test_openapi_covers_every_endpoint(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) == {
        "/runs",
        "/runs/{run_id}",
        "/runs/{run_id}/report",
        # The permalink surface. Redacted by default: §14.8 holds any
        # high-severity divergence out of it until a person releases it.
        "/runs/{run_id}/report/public",
        "/runs/{run_id}/stream",
        "/runs/{run_id}/artifact",
        # The author response flow. Behaviour is covered by tests/test_amendments.py
        # and tests/test_review.py; this list only asserts the surface exists.
        "/runs/{run_id}/findings",
        "/runs/{run_id}/amendments",
        "/runs/{run_id}/amendments/{fingerprint}/recheck",
        "/runs/{run_id}/review",
        "/runs/{run_id}/review/{fingerprint}/release",
        "/runs/{run_id}/review/amendments/{fingerprint}/release",
        "/runs/{run_id}/review/amendments/{fingerprint}/decline",
        "/runs/{run_id}/review/{fingerprint}/suppress",
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


def test_no_check_result_is_stored_with_a_non_terminal_status(client, run_id):
    """§10 is append-only: `pending` and `running` are derived from the manifest,
    so they must not appear anywhere in a stored result."""
    body = client.get(f"/runs/{run_id}").json()
    assert "status" not in json.dumps(body["report"])


# --------------------------------------------------------------------------
# The credential
#
# The API had no auth of any kind: no `Depends`, no security scheme, nothing.
# An anonymous caller could release a held high-severity finding onto a public
# permalink, suppress a true one (which writes a negative fixture that
# tests/test_review.py reads), and spend our arXiv rate limit.
#
# What is asserted here is the *boundary*, not one route at a time. A test that
# listed the closed routes would pass forever while a new route was added open
# beside them, which is exactly how this happened.
# --------------------------------------------------------------------------


# The complete set of routes an unauthenticated caller may reach, and the reason
# each one is on it. Adding to this list is the deliberate act; the test below
# fails on anything else that is left open.
PUBLIC_ROUTES = {
    # The permalink. Redacted — it is the only route that runs `redact()`, and a
    # URL somebody shares has to open for a reader with no credential.
    "/runs/{run_id}/report/public",
    # Liveness. Carries no paper, no run and no finding: only the check names and
    # versions this build ships, which are in the repository anyway.
    "/health",
}


def _gated(route) -> bool:
    """Whether `require_operator` is reachable from this route's dependant."""
    from pv.api.security import require_operator

    seen, stack = set(), [route.dependant]
    while stack:
        dependant = stack.pop()
        if id(dependant) in seen:
            continue
        seen.add(id(dependant))
        if dependant.call is require_operator:
            return True
        stack.extend(dependant.dependencies)
    return False


def test_every_route_is_gated_unless_it_is_deliberately_public(offline_app):
    """The boundary itself, so a new route cannot be added open by accident.

    This is the assertion the codebase most needed and did not have. Every
    failure mode CLAUDE.md records is a lossy step that silently produces a
    confident accusation; an ungated route is the same shape with the loss at the
    edge — the gate still holds the finding, and the finding is still readable.
    """
    open_routes = {
        route.path
        for route in offline_app.app.routes
        if hasattr(route, "dependant") and not _gated(route)
    }
    assert open_routes == PUBLIC_ROUTES


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/runs"),
        ("post", "/runs"),
        ("get", "/runs/abc"),
        ("get", "/runs/abc/report"),
        ("get", "/runs/abc/stream"),
        ("get", "/runs/abc/findings"),
        ("get", "/runs/abc/amendments"),
        ("post", "/runs/abc/amendments"),
        ("post", "/runs/abc/artifact"),
        ("get", "/runs/abc/review"),
        ("post", "/runs/abc/review/f/release"),
        ("post", "/runs/abc/review/f/suppress"),
        ("get", "/papers/1706.03762/repositories"),
    ],
)
def test_an_anonymous_caller_is_refused(anonymous, method, path):
    """401 before anything else — before the 404 for an unknown run, and before
    the 422 for a missing body. A route that validated first would tell an
    anonymous caller which run ids exist."""
    response = getattr(anonymous, method)(path) if method == "get" else (
        getattr(anonymous, method)(path, json={})
    )
    assert response.status_code == 401


def test_an_unset_secret_closes_the_door_rather_than_opening_it(
    offline_app, monkeypatch
):
    """The failure mode this whole module is shaped around.

    A deployment that forgot to set the variable must not serve held findings to
    the world. 503 rather than 401 because there is no credential the caller
    could send that would work — it is an operator's problem, and saying so is
    what gets it fixed.
    """
    monkeypatch.delenv(SECRET_ENV, raising=False)
    with TestClient(offline_app.app, headers={HEADER: SECRET}) as c:
        assert c.get("/runs").status_code == 503
        assert c.post("/runs", json={"arxiv_id": PAPER}).status_code == 503
        # Still open, still redacted. A permalink does not stop working because
        # the operator key is missing.
        assert c.get("/health").status_code == 200


def test_a_wrong_key_is_refused(anonymous):
    assert anonymous.get("/runs", headers={HEADER: "not-the-key"}).status_code == 401


def test_the_key_is_accepted_as_a_bearer_token(anonymous):
    resp = anonymous.get("/runs", headers={"Authorization": f"Bearer {SECRET}"})
    assert resp.status_code == 200


def test_the_key_is_accepted_as_a_cookie_because_eventsource_cannot_set_headers(
    anonymous, run_id
):
    """`EventSource` cannot put a header on its request, and the stream carries
    whole `CheckResult` payloads. Without this the dashboard's live rows could not
    be gated at all."""
    anonymous.cookies.set(COOKIE, SECRET)
    try:
        with anonymous.stream("GET", f"/runs/{run_id}/stream") as resp:
            assert resp.status_code == 200
            resp.read()
    finally:
        anonymous.cookies.clear()


def test_the_public_permalink_stays_open(anonymous, run_id):
    """The whole point of the boundary: the redacted view needs no credential."""
    assert anonymous.get(f"/runs/{run_id}/report/public").status_code == 200


def test_openapi_declares_no_security_scheme_it_does_not_implement(client):
    """A stopgap that advertised OAuth2 would be a lie in the generated client.

    The credential is a plain header checked by a dependency, and the schema says
    so by saying nothing. When real auth lands, this test is the reminder that the
    schema has to start describing it.
    """
    schema = client.get("/openapi.json").json()
    assert "securitySchemes" not in schema.get("components", {})


# --------------------------------------------------------------------------
# The dashboard list envelope (docs/DASHBOARD.md)
# --------------------------------------------------------------------------


def test_a_run_row_carries_everything_the_dashboard_renders(client, run_id):
    """`/runs` and `/reports` draw their rows from this and nothing else.

    The requirement is not convenience. A list screen that fetched a report per
    row to find its stage or its counts would issue N requests to draw N rows,
    and it would repeat them every time a run in flight moved.
    """
    row = next(r for r in client.get("/runs").json()["runs"] if r["run_id"] == run_id)

    # Stage, for the stage column and the stage filter. `status` is the coarse
    # three-value form and cannot express "waiting on me".
    #
    # Compared against the run's own envelope rather than hardcoded: which
    # terminal stage this paper reaches is the checkers' business, and a list row
    # asserting it would fail for a reason that has nothing to do with the list.
    # What matters here is that the row and the run agree.
    assert row["state"] == client.get(f"/runs/{run_id}").json()["state"]
    assert row["state"] in {"complete", "partial", "failed"}
    # Elapsed, computed against the server's clock rather than the browser's.
    assert row["elapsed_seconds"] is not None and row["elapsed_seconds"] >= 0
    # The verdict summary as counts, in the fixed §7 vocabulary.
    counts = row["counts"]
    assert set(counts) == {
        "matches",
        "within_tolerance",
        "diverges",
        "unverifiable",
        "not_checked",
    }
    # Every check that ran is counted exactly once, in exactly one column.
    assert sum(counts[k] for k in ("matches", "within_tolerance", "diverges", "unverifiable")) + \
        counts["not_checked"] == len(row["verdicts"]) + row["not_checked"]
    # §14.8, for the `/reports` row: whether the version a chair opens differs
    # from the version the author is looking at.
    assert row["held"] == row["held_findings"] + row["held_amendments"]


def test_a_run_that_has_not_started_reports_no_elapsed_time(client, own_store):
    """Null, never zero. Zero is a claim that it started and took no time."""
    record = app_module.store.create("0000.00000", [])
    row = next(
        r for r in client.get("/runs").json()["runs"] if r["run_id"] == record.run_id
    )
    assert row["elapsed_seconds"] is None
    assert row["state"] == "queued"


def test_not_attempted_is_counted_as_not_checked_not_as_a_fifth_verdict(client, own_store):
    """§7 fixes four verdict labels. `not_attempted` has none, and §5.5 calls it
    "not checked" — a row presenting it as a fifth verdict would render a normal
    outcome as a failure."""
    client.post("/runs", json={"arxiv_id": "2401.00001"})
    row = client.get("/runs").json()["runs"][0]
    assert row["counts"]["not_checked"] == 1
    assert row["counts"]["diverges"] == 0
