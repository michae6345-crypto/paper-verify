import type { Metadata } from "next";

import { AccountRecords } from "@/components/auth/account-records";
import { Measure, PageHead } from "@/components/auth/auth-shell";
import { listReports } from "@/lib/reports";

export const metadata: Metadata = {
  title: "residual: your submissions",
  description: "Your submissions, their verification records, and the reports behind them.",
};

/**
 * Steps three and four: the record residual issued, and the report behind it.
 *
 * Titles are looked up on the server from the committed reports and passed down
 * as a map, so a record can link to its report without the client component
 * importing `lib/reports` — that module reads the filesystem at import time and
 * cannot cross into the browser.
 */
export default function AccountPage() {
  const titles = Object.fromEntries(
    listReports().map((report) => [report.arxiv_id, report.title || report.arxiv_id]),
  );

  return (
    <Measure>
      <PageHead
        eyebrow="Steps three and four"
        title="Your submissions"
        lede="Each submission has a verification record. Send the record to the conference with the paper and the repository, and the report behind it is what the record refers to."
      />

      <AccountRecords titles={titles} />
    </Measure>
  );
}
