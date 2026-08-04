import Link from "next/link";
import { notFound } from "next/navigation";

import { CATALOG, entryBySlug } from "@/components/dashboard/catalog";
import { CatalogList, TestDetail } from "@/components/dashboard/tests";
import { Panel } from "@/components/dashboard/surface";

/**
 * One check, in depth.
 *
 * List and detail, side by side above 1100px, where the list is the way back and
 * the way sideways. Below that the list is not rendered at all: thirty-five rows
 * stacked under the thing the reader just opened is not a navigation aid, it is
 * the same screen again. A back link does that job on a phone.
 */

export function generateStaticParams() {
  return CATALOG.map((entry) => ({ slug: entry.slug }));
}

export default async function TestDetailScreen({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = entryBySlug(slug);
  if (!entry) notFound();

  return (
    <div className="grid items-start gap-5 three:grid-cols-[320px_minmax(0,1fr)]">
      <div className="hidden three:top-24 three:block three:max-h-[calc(100dvh-8rem)] three:overflow-y-auto three:pe-1 three:motion-safe:sticky">
        <CatalogList currentSlug={entry.slug} compact />
      </div>

      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/tests"
          className="t-body inline-flex items-center gap-2 self-start"
          style={{ color: "var(--chrome-dim)" }}
        >
          <span aria-hidden>&larr;</span> All tests
        </Link>

        <Panel>
          <TestDetail entry={entry} />
        </Panel>
      </div>
    </div>
  );
}
