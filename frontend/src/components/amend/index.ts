/**
 * The author response flow, packaged for whoever mounts it.
 *
 * `components/ledger/**` belongs to another workstream (OWNERSHIP.md), so this
 * module is the seam: everything here takes props and holds no assumption about
 * where it is drawn. Nothing in this directory imports from `ledger/`,
 * `document/` or `site/`, and nothing there needs to import more than the four
 * names below.
 *
 * ## What to mount, and where
 *
 * **1. `ContestButton` + `ContestForm` on a Discrepancy row.**
 *
 * Next to `Explain` in `ledger-row.tsx`, on rows where `row.group ===
 * "discrepancy"`. The two are separate on purpose: the button is a control on
 * the row, the form is a panel below it, and the row already owns an
 * expand/collapse mechanism for `Explain` that this should reuse rather than
 * duplicate.
 *
 * ```tsx
 * const fingerprint = fingerprints[row.identity] ?? null;
 *
 * <ContestButton
 *   fingerprint={fingerprint}
 *   contested={contested.has(fingerprint ?? "")}
 *   onOpen={() => onToggleContest(row.key)}
 * />
 * {contestOpen && fingerprint && (
 *   <ContestForm
 *     runId={runId}
 *     fingerprint={fingerprint}
 *     client={client}
 *     onCancel={() => onToggleContest(row.key)}
 *   />
 * )}
 * ```
 *
 * `row.identity` is already `"<domId>:<checker>"` in `ledger/groups.ts`, which
 * is exactly the key `AmendmentClient.findings` returns. Nothing needs to change
 * there. A row whose identity is not in the map gets `null`, and the button
 * renders as unavailable and says so rather than disappearing.
 *
 * **2. `AmendmentHistory` on the report.**
 *
 * A section on the report page, below the ledger — not inside it. It is about
 * the report as a whole, and the ledger is a virtualised list.
 *
 * ```tsx
 * <AmendmentHistory amendments={report.amendments ?? []} />
 * ```
 *
 * `RunReport.amendments` is on the contract and the API attaches it to
 * `GET /runs/{id}/report`, so a fixture build renders an empty section and a
 * live build renders the log, from the same prop.
 *
 * ## Where the client comes from
 *
 * `readOnlyClient` for a fixture build — every Contest affordance renders as
 * unavailable, which is honest: there is nowhere to send a statement. Swap in
 * `createAmendmentClient(baseUrl)` when the page is talking to the API.
 * Fetch the fingerprint map once per report, not per row:
 *
 * ```ts
 * const fingerprints = await client.findings(runId);
 * ```
 *
 * ## What is not here
 *
 * The review gate (§14.8) has no component in this directory. Its surface is an
 * operator's queue, not a reader's, and putting a suppress control anywhere near
 * a report page is how one gets pressed by accident. It is served by
 * `GET /runs/{id}/review` and the decision endpoints, and the redaction it
 * enforces is already applied server-side by `GET /runs/{id}/report/public` —
 * a public page needs no client-side gate logic, and must not have one.
 *
 * ## What a submitted statement does, and does not, do
 *
 * There is no auth layer, so anyone who can reach the endpoint can file a
 * statement against any finding. Two consequences shape the copy in `copy.ts`
 * and must survive any edit to it:
 *
 * - **A statement is not published on arrival.** It lands in the review queue
 *   next to high-severity divergences and a person reads it first. `ContestForm`
 *   says exactly that on success; it must never say the statement is now shown.
 * - **A statement changes nothing else.** The finding it contests stays where it
 *   was, whatever happens to the statement — otherwise anyone could erase a
 *   finding by objecting to it.
 *
 * Nothing here attributes a statement to a person. `AmendmentHistory` renders no
 * name and `CreateAmendmentRequest` carries no name field, because a name we
 * were told is not a name we can print beside a claim about someone's paper.
 */

export { AmendmentHistory } from "./amendment-history";
export { ContestButton, ContestForm, type ContestState } from "./contest";
export {
  createAmendmentClient,
  readOnlyClient,
  type AmendmentClient,
  type ContestInput,
  type RecheckResult,
} from "./client";
export { CONTEST_ACTION, HISTORY_TITLE, statusLabel } from "./copy";
