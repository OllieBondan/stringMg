import JobList from "@/components/JobList";
import { countArchivable, listJobs } from "@/lib/repository";
import { isTasya } from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireSessionUser();
  const [jobs, archivableCount] = await Promise.all([listJobs(), countArchivable()]);
  return (
    <JobList jobs={jobs} canConfirmTasya={isTasya(user.email)} archivableCount={archivableCount} />
  );
}
