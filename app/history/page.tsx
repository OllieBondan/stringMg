import Link from "next/link";
import JobList from "@/components/JobList";
import { isTasya } from "@/lib/permissions";
import { listArchivedJobs } from "@/lib/repository";
import { requireSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireSessionUser();
  const jobs = await listArchivedJobs();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">🕘 Job History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Completed jobs archived after a month — nothing here was deleted.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/50"
        >
          🏠 Main menu
        </Link>
      </div>
      <JobList jobs={jobs} variant="history" canConfirmTasya={isTasya(user.email)} />
    </div>
  );
}
