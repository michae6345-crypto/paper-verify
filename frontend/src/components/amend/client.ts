import type { Amendment, CheckResult } from "@/types/run-report";

/**
 * The transport for the author response flow.
 *
 * Everything in `components/amend/**` takes its client as a prop. That is not
 * ceremony: the frontend currently renders from static fixtures with no backend
 * behind it (`lib/reports.ts`), so a component that reached for `fetch` on its
 * own would either be untestable or would be dead code with a live-looking
 * surface. Injecting it means the same components render today against
 * `readOnlyClient` and tomorrow against `createAmendmentClient(baseUrl)`, with
 * nothing to rewrite in between.
 *
 * The endpoints these call are generated from Pydantic models in
 * `backend/pv/api/schemas.py`. The types below are the shape of the ones that
 * are *not* on the contract — `Amendment` and `CheckResult` are imported from the
 * generated file, never restated here (§8).
 */

/** `POST /runs/{run_id}/amendments` */
export type ContestInput = {
  /**
   * Which judgement is being contested. Not a row id: a §14.5 fingerprint over
   * the finding's content, the checker, the checker version and the policy
   * version. Improve the checker and this stops resolving, which is correct —
   * the objection was made about a specific reading of the paper.
   *
   * Derived server-side and served by `GET /runs/{run_id}/findings`. It is
   * deliberately not recomputed in TypeScript: two implementations of the hash
   * that decides which objection attaches to which accusation is the one
   * duplication this codebase cannot afford.
   */
  findingFingerprint: string;
  authorStatement: string;
  correctedValue?: string | null;
};

/** `POST /runs/{run_id}/amendments/{fingerprint}/recheck` */
export type RecheckResult = {
  amendment: Amendment;
  /**
   * False on a §14.5 cache hit: the check has not changed since the run, so the
   * stored result is the answer and nothing was executed. Shown as such — the UI
   * never says "we checked it again" about work that did not happen.
   */
  executed: boolean;
  /**
   * Whether the contested comparison is still reported. `null` means we could
   * not establish it, and is never rendered as a clearance.
   */
  stillFound: boolean | null;
  result: CheckResult | null;
  note: string;
};

export type AmendmentClient = {
  /** Fingerprint per rendered row, keyed `"<dom_id>:<checker>"`. */
  findings(runId: string): Promise<Record<string, string>>;
  history(runId: string): Promise<Amendment[]>;
  contest(runId: string, input: ContestInput): Promise<Amendment>;
  recheck(runId: string, fingerprint: string): Promise<RecheckResult>;
};

/**
 * The client for a build with no API behind it.
 *
 * `findings` returns nothing, which makes every Contest affordance render as
 * unavailable rather than as a button that fails when pressed. Offering an
 * author a way to respond and then dropping their statement is worse than not
 * offering one.
 */
export const readOnlyClient: AmendmentClient = {
  async findings() {
    return {};
  },
  async history() {
    return [];
  },
  async contest() {
    throw new Error("This report is being shown from a fixture, so nothing can be sent.");
  },
  async recheck() {
    throw new Error("This report is being shown from a fixture, so nothing can be sent.");
  },
};

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response
      .json()
      .then((b: { detail?: string }) => b.detail)
      .catch(() => undefined);
    throw new Error(detail ?? "That could not be sent. Nothing has been recorded.");
  }
  return (await response.json()) as T;
}

export function createAmendmentClient(baseUrl: string): AmendmentClient {
  const at = (path: string) => `${baseUrl.replace(/\/$/, "")}${path}`;
  const post = (path: string, body?: unknown) =>
    fetch(at(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });

  return {
    async findings(runId) {
      const body = await json<{ by_row: Record<string, string> }>(
        await fetch(at(`/runs/${runId}/findings`)),
      );
      return body.by_row;
    },
    async history(runId) {
      const body = await json<{ amendments: Amendment[] }>(
        await fetch(at(`/runs/${runId}/amendments`)),
      );
      return body.amendments;
    },
    async contest(runId, input) {
      return json<Amendment>(
        await post(`/runs/${runId}/amendments`, {
          finding_fingerprint: input.findingFingerprint,
          author_statement: input.authorStatement,
          corrected_value: input.correctedValue ?? null,
        }),
      );
    },
    async recheck(runId, fingerprint) {
      const body = await json<{
        amendment: Amendment;
        executed: boolean;
        still_found: boolean | null;
        result: CheckResult | null;
        note: string;
      }>(await post(`/runs/${runId}/amendments/${fingerprint}/recheck`));
      return {
        amendment: body.amendment,
        executed: body.executed,
        stillFound: body.still_found,
        result: body.result,
        note: body.note,
      };
    },
  };
}
