import type { Amendment } from "@/types/run-report";

import { HISTORY_BLURB, HISTORY_EMPTY, HISTORY_TITLE, statusLabel, whenSubmitted } from "./copy";

/**
 * The amendment history section on a report.
 *
 * Oldest first, and every row — not the standing amendment per finding. The
 * sequence is the point: a reader has to be able to follow the objection, the
 * recheck, and the outcome. A list that showed only the latest state would hide
 * the fact that someone objected at all once the objection was answered.
 *
 * The author's words are rendered in the document serif, the same face the
 * paper's own claims are quoted in on a ledger row. That is deliberate. Their
 * statement is a claim in the same register as the paper's; setting it in our
 * interface font would make it look like a support ticket we had filed about
 * them.
 *
 * A server component: it renders from data, holds no state, and the report is
 * already on the page. It takes the amendments as a prop rather than fetching,
 * so the same section renders from `report.amendments` in a fixture build and
 * from the API when there is one.
 */
export function AmendmentHistory({
  amendments,
  className,
}: {
  amendments: Amendment[];
  className?: string;
}) {
  return (
    <section className={className} aria-labelledby="amendments-heading">
      <h2
        id="amendments-heading"
        className="t-emph"
        style={{ color: "var(--chrome-text)" }}
      >
        {HISTORY_TITLE}
      </h2>
      <p className="mt-1 t-body" style={{ color: "var(--chrome-dim)" }}>
        {HISTORY_BLURB}
      </p>

      {amendments.length === 0 ? (
        // Not an empty state to apologise for. Most reports have none, and a
        // report nobody has contested is the ordinary case.
        <p className="mt-3 t-body" style={{ color: "var(--chrome-faint)" }}>
          {HISTORY_EMPTY}
        </p>
      ) : (
        <ol className="mt-3 flex flex-col">
          {amendments.map((amendment, i) => (
            <AmendmentRow
              key={`${amendment.finding_fingerprint}#${i}`}
              amendment={amendment}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function AmendmentRow({ amendment }: { amendment: Amendment }) {
  const when = whenSubmitted(amendment);
  return (
    <li className="border-b py-3" style={{ borderColor: "var(--chrome-line)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="t-emph" style={{ color: "var(--chrome-text)" }}>
          {statusLabel(amendment)}
        </span>
        {when && (
          <span className="t-num" style={{ fontSize: "12px", color: "var(--chrome-faint)" }}>
            {when}
          </span>
        )}
      </div>

      {amendment.author_statement && (
        <p
          className="mt-1.5"
          style={{
            fontFamily: "var(--font-doc), ui-serif, Georgia, serif",
            fontSize: "15px",
            lineHeight: 1.5,
            color: "var(--chrome-text)",
          }}
        >
          {amendment.author_statement}
        </p>
      )}

      {amendment.corrected_value != null && amendment.corrected_value !== "" && (
        <p className="mt-1.5 t-num" style={{ color: "var(--chrome-text)" }}>
          {amendment.corrected_value}{" "}
          <span className="t-body" style={{ color: "var(--chrome-faint)" }}>
            given as the correct value
          </span>
        </p>
      )}

      {/* Our sentence about the recheck, kept visibly separate from theirs. */}
      {amendment.resolution_note && (
        <p className="mt-1.5 t-body" style={{ color: "var(--chrome-dim)" }}>
          {amendment.resolution_note}
        </p>
      )}

      {/*
        The fingerprint, in full, in mono. It looks like internal detail and is
        not: it is what makes the objection checkable a year later, and it is why
        the amendment stops applying if we change the check. An author arguing
        with us should be able to see exactly which judgement they are attached
        to.
      */}
      <p
        className="mt-2 t-num"
        style={{ fontSize: "11px", color: "var(--chrome-faint)", overflowWrap: "anywhere" }}
      >
        finding {amendment.finding_fingerprint}
      </p>
    </li>
  );
}
