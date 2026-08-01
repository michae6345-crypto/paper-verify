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

from ..amendments import AmendmentStore, recheck_finding
from ..amendments.identity import fingerprints_in
from ..amendments.recheck import FindingNotInRun
from ..checks.repos import find_repositories, find_repository_candidates
from ..models import Amendment, Artifact, RunReport
from ..orchestrator import RunNotFound, RunNotWaiting, get_orchestrator
from ..review import (
    ReleaseRequiresReview,
    ReviewEntry,
    ReviewQueue,
    ReviewState,
    held_notice,
    redact,
)
from . import jobs
from .config import Settings
from .schemas import (
    AmendmentList,
    ConfirmArtifactRequest,
    CreateAmendmentRequest,
    CreateRunRequest,
    DoneEvent,
    FindingIndex,
    PublicReport,
    RecheckResponse,
    ReleaseRequest,
    ReviewItem,
    ReviewQueueResponse,
    Run,
    RunList,
    RunManifest,
    StreamEvent,
    StreamPayload,
    SuppressRequest,
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
# Append-only, and process-local like the run store: both hold the shape their
# Postgres table will hold. An amendment is never edited, including by us.
amendments = AmendmentStore()
# §14.8. Holds only decisions; what is *waiting* is derived from the report each
# time it is asked for, so a finding cannot be held in a list that has fallen out
# of step with what the run produced. Absence of a decision means held.
review = ReviewQueue()

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


def _report_with_amendments(run_id: str) -> RunReport:
    """The stored report, with the amendment log attached.

    `RunReport.amendments` is on the contract; the run store does not know about
    the amendment store, so they are joined here. Attached to a fresh copy each
    time — the amendments are a separate append-only log and must not be written
    back into the run's record of what it found.
    """
    report = _record_or_404(run_id).report()
    report.amendments = amendments.history(run_id)
    return report


@app.get("/runs/{run_id}/report", response_model=RunReport, tags=["runs"])
async def get_report(run_id: str = Path(...)) -> RunReport:
    """The bare `RunReport` — the same object the CLI prints and §5.5 renders.

    This is the full report, including findings the §14.8 gate is still holding.
    It is the working surface, not the permalink: `GET /runs/{id}/report/public`
    is what a shared URL serves.
    """
    return _report_with_amendments(run_id)


@app.get("/runs/{run_id}/report/public", response_model=PublicReport, tags=["runs"])
async def get_public_report(run_id: str = Path(...)) -> PublicReport:
    """The report as a permalink shows it (§14.8).

    Any finding with `verdict: diverges` and `severity: high` is withheld until a
    person releases it, and a check whose findings are all withheld is removed
    rather than left asserting a verdict whose evidence is not on the page.

    Redaction is the default and requires no configuration: a finding with no
    review decision recorded against it is held. There is no setting under which
    an unread high-severity divergence appears here.
    """
    report = _report_with_amendments(run_id)
    public, held = redact(report, review, run_id)
    return PublicReport(run_id=run_id, report=public, held=held, notice=held_notice(held))


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
# Amendments — the author response flow (brief Part 2, item 1)
#
# What happens when we are wrong about someone in public. Every route here is
# append-only: nothing edits or deletes the finding it answers, and nothing edits
# an amendment either. A resolution is a new row that supersedes the one before
# it in the reader's view, and both stay on the record — an amendment is someone
# else's words about us, and there is no defensible version of editing those.
# --------------------------------------------------------------------------


@app.post(
    "/runs/{run_id}/amendments",
    response_model=Amendment,
    status_code=201,
    tags=["amendments"],
)
async def create_amendment(
    body: CreateAmendmentRequest, run_id: str = Path(...)
) -> Amendment:
    """Contest one finding. A normal action, not a complaint form.

    `finding_fingerprint` identifies the judgement rather than a row: it is a
    §14.5 fingerprint over the finding's content, the checker, the checker version
    and the policy version. **That is the point.** Bump a checker version or a
    tolerance policy and every fingerprint under it changes, so this statement
    correctly stops applying to a judgement it was never made about — we can
    improve a check without silently carrying an author's objection onto a reading
    of their paper they have never seen.

    404 when no finding in this run carries that fingerprint. That is usually not
    a client error: it is what a stale permalink looks like after the check that
    produced the finding was improved.
    """
    report = _record_or_404(run_id).report()
    located = fingerprints_in(report).get(body.finding_fingerprint)
    if located is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No finding in this run carries that fingerprint. The check that "
                "produced it may have changed since this page was opened."
            ),
        )
    _check, finding = located
    return amendments.append(
        run_id,
        Amendment(
            finding_fingerprint=body.finding_fingerprint,
            # `Claim.content_hash` is the right value here, but a `RunReport`
            # ships `CheckResult` and `Finding` only — no claims — so there is no
            # content hash on the wire to record. The anchor is what a reader can
            # go and look at, and it is honest about being a locator rather than a
            # claim id. Replace this the day the report carries claims.
            claim_id=finding.anchor.dom_id,
            author_statement=body.author_statement,
            corrected_value=body.corrected_value,
            status="open",
        ),
    )


@app.get("/runs/{run_id}/findings", response_model=FindingIndex, tags=["amendments"])
async def get_finding_index(run_id: str = Path(...)) -> FindingIndex:
    """The fingerprint of every finding in this run, so a rendered row can say
    which judgement it is offering to contest.

    `Finding` carries no fingerprint on the contract — it is derived, not stored.
    Deriving it a second time in the browser is the option not taken: a second
    implementation of the hash that decides which objection attaches to which
    accusation is the one place this codebase's duplicate-primitive habit must not
    reach. There is one implementation, in Python, and this serves its output.

    `by_row` is keyed `"<dom_id>:<checker>"` — the identity the ledger already
    builds each row on. A key two findings would share is omitted rather than
    resolved to either of them; attaching an author's statement to the wrong
    finding is not a trade-off worth making, and the fingerprint is still listed.
    """
    report = _record_or_404(run_id).report()
    index = fingerprints_in(report)

    seen: dict[str, int] = {}
    keys: dict[str, str] = {}
    for fp, (check, finding) in index.items():
        key = f"{finding.anchor.dom_id}:{check.checker}"
        seen[key] = seen.get(key, 0) + 1
        keys[fp] = key

    by_row = {key: fp for fp, key in keys.items() if seen[key] == 1}
    return FindingIndex(run_id=run_id, fingerprints=list(index), by_row=by_row)


@app.get("/runs/{run_id}/amendments", response_model=AmendmentList, tags=["amendments"])
async def list_amendments(run_id: str = Path(...)) -> AmendmentList:
    """The amendment history for a report, oldest first.

    Every row, including superseded ones: a reader has to be able to follow the
    objection, the recheck and the outcome as a sequence. `current` is the
    superseding view — the standing amendment per fingerprint — which is what a
    Discrepancy row consults to know it has been contested.
    """
    _record_or_404(run_id)
    return AmendmentList(
        run_id=run_id,
        amendments=amendments.history(run_id),
        current=amendments.current(run_id),
    )


@app.post(
    "/runs/{run_id}/amendments/{fingerprint}/recheck",
    response_model=RecheckResponse,
    tags=["amendments"],
)
async def recheck_amendment(
    run_id: str = Path(...), fingerprint: str = Path(...)
) -> RecheckResponse:
    """Run the contested claim again and record what it produced.

    Reuses §14.5 rather than re-running the paper: the fingerprint is looked up
    first, and only a miss executes. A checker whose version has not moved since
    the run is a cache hit — the verdict is a function of the claim, the checker
    version and the policy version, so executing would reproduce the stored row —
    and the response says so with `executed: false` rather than claiming work we
    did not do. A miss re-runs exactly one check against the document and tables
    the run already holds. Nothing is fetched and nothing is re-parsed.

    The recheck writes no verdict. `result` is returned, never appended to the
    run: the run is the record of what we found when we looked, and a second look
    is a separate event. What is stored is a new amendment row carrying
    `recheck_result_fingerprint`.
    """
    _record_or_404(run_id)
    previous = amendments.latest(run_id, fingerprint)
    if previous is None:
        raise HTTPException(
            status_code=404,
            detail="No amendment has been filed against that finding in this run.",
        )

    try:
        outcome = recheck_finding(orchestrator, run_id, fingerprint)
    except (RunNotFound, FindingNotInRun):
        raise HTTPException(
            status_code=404,
            detail=(
                "The run state for this report is no longer available, so the "
                "claim could not be checked again."
            ),
        ) from None

    # §7: `resolved` is not a judgement about who was right. It means the contested
    # comparison is no longer reported, which is the only thing we can state.
    status = "resolved" if outcome.still_found is False else "recheck_requested"
    amendment = amendments.supersede(
        run_id,
        previous,
        status=status,
        recheck_result_fingerprint=outcome.result_fingerprint or None,
        resolution_note=outcome.note,
    )
    return RecheckResponse(
        run_id=run_id,
        amendment=amendment,
        executed=outcome.executed,
        still_found=outcome.still_found,
        result=outcome.result,
        note=outcome.note,
    )


# --------------------------------------------------------------------------
# Review gate (§14.8)
#
# One person reading a short list, at current scale. Built now because
# retrofitting a review gate after something has been published is impossible,
# and because `docs/DEPLOY.md` flags public-by-default permalinks as unresolved.
# --------------------------------------------------------------------------


def _review_item(entry: ReviewEntry) -> ReviewItem:
    return ReviewItem(
        fingerprint=entry.fingerprint,
        state=entry.state,
        checker=entry.checker,
        checker_version=entry.checker_version,
        policy_version=entry.policy_version,
        siglum=entry.siglum,
        locator=entry.locator,
        claimed=entry.claimed,
        computed=entry.computed,
        delta=entry.delta,
        verbatim=entry.verbatim,
        explanation=entry.explanation,
        reason=entry.reason,
        note=entry.note,
        decided_at=entry.decided_at,
        decided_by=entry.decided_by,
    )


@app.get("/runs/{run_id}/review", response_model=ReviewQueueResponse, tags=["review"])
async def get_review_queue(run_id: str = Path(...)) -> ReviewQueueResponse:
    """Everything in this run the gate holds, in report order.

    Released findings stay in the list with `state: released`. The queue is the
    record of what was reviewed, not only of what is outstanding — a list that
    empties as decisions are made cannot answer "who released this, and when".
    """
    record = _record_or_404(run_id)
    report = record.report()
    items = [_review_item(e) for e in review.pending(run_id, report)]
    return ReviewQueueResponse(
        run_id=run_id,
        arxiv_id=record.arxiv_id,
        items=items,
        held=sum(1 for i in items if i.state is not ReviewState.RELEASED),
    )


@app.post(
    "/runs/{run_id}/review/{fingerprint}/release",
    response_model=ReviewItem,
    tags=["review"],
)
async def release_finding(
    body: ReleaseRequest, run_id: str = Path(...), fingerprint: str = Path(...)
) -> ReviewItem:
    """A person has read this finding and it may appear on the permalink."""
    report = _record_or_404(run_id).report()
    try:
        entry = review.release(
            run_id, report, fingerprint, by=body.decided_by, note=body.note
        )
    except ReleaseRequiresReview as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    return _review_item(entry)


@app.post(
    "/runs/{run_id}/review/{fingerprint}/suppress",
    response_model=ReviewItem,
    tags=["review"],
)
async def suppress_finding(
    body: SuppressRequest, run_id: str = Path(...), fingerprint: str = Path(...)
) -> ReviewItem:
    """This finding is wrong. Never publish it, and never produce it again.

    The reason is required, and the second half of that sentence is what it buys:
    the suppression is written into `fixtures/suppressions/` as a negative
    fixture, so a false positive we caught once becomes a permanent regression
    test rather than a decision somebody remembers. `tests/test_review.py` reads
    that directory.

    Suppressing does not delete the finding. The run's record of what it found is
    unchanged and remains readable at `GET /runs/{id}/report`; what changes is
    that it is never published.
    """
    report = _record_or_404(run_id).report()
    try:
        entry = review.suppress(
            run_id,
            report,
            fingerprint,
            reason=body.reason,
            note=body.note,
            by=body.decided_by,
        )
    except ReleaseRequiresReview as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    return _review_item(entry)


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


__all__ = [
    "app",
    "amendments",
    "review",
    "settings",
    "store",
    "DoneEvent",
    "StreamEvent",
]
