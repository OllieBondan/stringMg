import { NextRequest, NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { readAll as readLegacyCsv } from "@/lib/csvRepository";
import { assertImportableJob, insertJob } from "@/lib/repository";

export const dynamic = "force-dynamic";

/**
 * One-time migration helper: copies every record from the legacy Blob CSV
 * (records.csv) into the Postgres jobs table. Idempotent — already-imported
 * ids are skipped, so it is safe to run repeatedly. Requires being signed in.
 *
 * Usage: open /api/admin/import-csv?run=1 in the browser while signed in.
 * The legacy Blob file itself is left untouched (it stays as a backup).
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    if (req.nextUrl.searchParams.get("run") !== "1") {
      return NextResponse.json({
        message:
          "Dry endpoint — append ?run=1 to import all records from the legacy Blob CSV into Postgres. " +
          "Safe to run more than once; existing ids are skipped.",
      });
    }

    const legacyJobs = await readLegacyCsv();
    let imported = 0;
    for (const job of legacyJobs) {
      assertImportableJob(job);
      if (await insertJob(job, true)) imported++;
    }
    return NextResponse.json({
      totalInCsv: legacyJobs.length,
      imported,
      skippedExisting: legacyJobs.length - imported,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
