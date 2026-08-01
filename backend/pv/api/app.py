"""The HTTP surface. Build-order step 2 (brief §11).

    uvicorn pv.api.app:app --reload        (from `backend/`)

Every response model is a Pydantic model, and every payload carrying checker
output carries the contract type from `pv.models`. The OpenAPI schema this
generates is what the frontend generates its TypeScript from (§8), so an ad-hoc
dict here becomes a hand-written type there, which is the thing §8 forbids.

Streaming is SSE in both local and hosted mode. Supabase Realtime is a *client*
subscribing to Postgres while SSE is a *server* endpoint — opposite data flow —
and Realtime delivers raw row payloads that bypass the Pydantic contract §8 makes
the source of truth. One transport, one contract.

Jobs are `QUEUE_BACKEND=inline` via FastAPI `BackgroundTasks` (§13): no Redis, no
arq. The CPU-bound stages inside the job run in a threadpool (see `jobs.py`), so
a paper that takes eight seconds to parse does not starve the streams.
"""

from __future__ import annotations

from typing import AsyncIterator

from fastapi import BackgroundTasks, FastAPI, HTTPException, Path, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from ..checks.repos import find_repositories, find_repository_candidates
from ..models import Artifact, RunReport
from ..orchestrator import RunNotFound, RunNotWaiting, get_orchestrator
from . import jobs
from .config import Settings
from .schemas import (
    ConfirmArtifactRequest,
    CreateRunRequest,
    DoneEvent,
    Run,
    RunList,
    RunManifest,
    StreamEvent,
    StreamPayload,
)
from .store import Event, RunStore

DESCRIPTION = """
Checks whether a paper's own numbers agree with each other.

Verdicts are computed by deterministic Python, never by a language model. A check
that cannot be made deterministic returns `unverifiable` with a reason code — a
run where half the checks are unverifiable is a normal result, not a failure.
""".strip()

app = FastAPI(
    title="paper-verify",
    version="0.1.0",
    description=DESCRIPTION,
)

settings = Settings.from_env()
store = RunStore(max_runs=settings.max_runs)
# One orchestrator for the process, so a `POST /runs/{id}/artifact` addresses the
# same run the background job is driving. The state store behind it is what makes
# a run survive a restart (`PV_STATE_DIR`).
orchestrator = get_orchestrator()

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _record_or_404(run_id: str):
    record = store.get(run_id)
    if record is None:
        # A run id we never issued is a client error. A *paper* we could not
        # check is not — that comes back as a report.
        raise HTTPException(status_code=404, detail=f"No run {run_id}")
    return record


# --------------------------------------------------------------------------
# Runs
# --------------------------------------------------------------------------


@app.post("/runs", response_model=Run, status_code=202, tags=["runs"])
async def create_run(body: CreateRunRequest, background: BackgroundTasks) -> Run:
    """Start a run and return its id immediately.

    `arxiv_id` may be a bare id, a versioned id, or an arXiv URL. A string that is
    not an arXiv id still produces a run — one that finishes at once with a report
    saying there was no source to read.

    The returned `manifest` is the full list of checks this run intends to
    execute. Render it now; `pending` and `running` are the difference between it
    and the results that have landed.

    `confirm_repository` pauses the run in `awaiting_artifact` when the paper
    links a repository, for the §5.2 confirmation screen. It is not a commitment:
    the run proceeds without code after ten minutes either way, because a run must
    never block indefinitely on a human.
    """
    arxiv_id, version, id_error = jobs.normalize_id(body.arxiv_id)
    record = store.create(arxiv_id, jobs.manifest_checks(), version=version)
    background.add_task(
        jobs.execute,
        record,
        settings,
        id_error=id_error,
        await_artifact=body.confirm_repository,
        orchestrator=orchestrator,
    )
    return record.envelope()


@app.get("/runs", response_model=RunList, tags=["runs"])
async def list_runs(limit: int = Query(20, ge=1, le=100)) -> RunList:
    """Recently checked papers (§5.1), most recent first."""
    return RunList(runs=[record.summary() for record in store.recent(limit)])


@app.get("/runs/{run_id}", response_model=Run, tags=["runs"])
async def get_run(run_id: str = Path(...)) -> Run:
    """The run as it stands. Mid-run this is a partial report: the checks that
    have finished, and nothing invented for the ones that have not."""
    return _record_or_404(run_id).envelope()


@app.get("/runs/{run_id}/report", response_model=RunReport, tags=["runs"])
async def get_report(run_id: str = Path(...)) -> RunReport:
    """The bare `RunReport` — the same object the CLI prints and §5.5 renders."""
    return _record_or_404(run_id).report()


@app.post("/runs/{run_id}/artifact", response_model=Run, tags=["runs"])
async def confirm_artifact(
    body: ConfirmArtifactRequest, run_id: str = Path(...)
) -> Run:
    """Answer the §5.2 repository question and release the run.

    `artifact: null` means "continue without code", which §5.2 calls a legitimate
    path — the run proceeds and code-dependent checks resolve to
    `unverifiable / no_code_repository`.

    409 when the run is not waiting: usually the ten-minute window closed and the
    run already took that same path automatically. Nothing is broken, and the
    report is on its way — which is why this is a conflict and not an error.
    """
    record = _record_or_404(run_id)
    try:
        orchestrator.confirm_artifact(run_id, body.artifact)
    except RunNotFound:
        raise HTTPException(status_code=404, detail=f"No run {run_id}") from None
    except RunNotWaiting as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    record.confirm_artifact(body.artifact)
    return record.envelope()


@app.get(
    "/runs/{run_id}/stream",
    tags=["runs"],
    response_class=EventSourceResponse,
    responses={
        200: {
            "model": StreamPayload,
            "content": {"text/event-stream": {}},
            "description": (
                "Server-sent events. `manifest` once, then one `check` per completed "
                "check in manifest order, then a terminal `done`. A run paused for "
                "the §5.2 repository confirmation also emits one `state`."
            ),
        }
    },
)
async def stream_run(request: Request, run_id: str = Path(...)) -> EventSourceResponse:
    """One event per check, as it completes, then a terminal event.

    A subscriber is replayed everything that has already landed before it sees a
    live event, so connecting late — or reconnecting — shows the whole run rather
    than the tail of it. That is only possible because results are append-only.

    Event names and their `data` payloads:
      `manifest` -> RunManifest   the checks this run intends to execute
      `check`    -> CheckEvent    one terminal CheckResult, with its manifest index
      `state`    -> StateEvent    the run is paused on the §5.2 confirmation screen
      `done`     -> DoneEvent     the complete run; the stream closes after it
    """
    record = _record_or_404(run_id)
    queue, replay = record.subscribe()

    def encode(event: Event) -> dict:
        name, payload = event
        return {"event": name.value, "data": payload.model_dump_json()}

    async def publisher() -> AsyncIterator[dict]:
        try:
            for event in replay:
                yield encode(event)
            while True:
                if await request.is_disconnected():
                    break
                event = await queue.get()
                if event is None:  # terminal: the run finished
                    break
                yield encode(event)
        finally:
            record.unsubscribe(queue)

    return EventSourceResponse(publisher())


# --------------------------------------------------------------------------
# Papers
# --------------------------------------------------------------------------


@app.get(
    "/papers/{arxiv_id:path}/repositories",
    response_model=list[Artifact],
    tags=["papers"],
)
async def paper_repositories(arxiv_id: str) -> list[Artifact]:
    """§5.2 candidates, best first, with `confidence` for preselection.

    This proposes; the user confirms. Nothing here is a verdict. An empty list is
    a legitimate answer — a paper with no repository is a normal paper, and
    "continue without code" is a normal path, not a failure. A paper with no
    LaTeX source likewise comes back empty rather than as an error.
    """
    normalized, _version, id_error = jobs.normalize_id(arxiv_id)
    if id_error is not None:
        return []

    document, reason, _detail = await jobs.load_document(normalized, settings)
    if reason is not None or document is None:
        return []

    if settings.offline:
        # No metadata lookup: stars and last commit stay unset rather than wrong.
        return find_repository_candidates(document)
    return await find_repositories(document)


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------


@app.get("/health", response_model=RunManifest, tags=["meta"], include_in_schema=False)
async def health() -> RunManifest:
    """The check manifest a new run would get. Doubles as a liveness probe: it
    exercises check discovery, which is the part most likely to be misconfigured."""
    return RunManifest(run_id="", arxiv_id="", checks=jobs.manifest_checks())


__all__ = ["app", "settings", "store", "DoneEvent", "StreamEvent"]
