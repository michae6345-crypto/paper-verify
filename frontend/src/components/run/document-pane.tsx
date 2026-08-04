"use client";

import type { RunReport } from "@/types/run-report";
import { DocumentView } from "@/components/document/document-view";

/**
 * The run view's document pane.
 *
 * It used to be a placeholder: a title, a rule, and two paragraphs saying the
 * paper's source was "not rendered here yet". That seam has been closed on the
 * report side for a while, so the run view was showing a reader an apology while
 * the identical report route four characters away in the URL showed them the
 * paper. Watching a run is the moment a reader most wants to see what is being
 * read.
 *
 * So it renders `DocumentView`, the same component the report renders, rather
 * than a second implementation of the same page. That is deliberate and it is
 * the lesson CLAUDE.md draws from the two `latexutil.py` modules: two files
 * quietly implementing one thing in two ways is invisible to any single file
 * read, and the way to not have it is to not write the second one.
 *
 * `annotated={false}` is the only difference. The run view has no ledger and no
 * gutter marks, so the pane must not tell the reader that "each mark points at
 * the cell a check looked at" — there are no marks on that screen. Selection is
 * inert here for the same reason.
 */
export function DocumentPane({ report }: { report: RunReport }) {
  return (
    <DocumentView
      report={report}
      marks={[]}
      selectedDomId={null}
      selectedVerdict={null}
      reduced
      annotated={false}
      onSelect={() => {}}
    />
  );
}
