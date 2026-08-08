import JobList from "@/components/JobList";
import { countArchivable, listJobs } from "@/lib/repository";
import { roleOf } from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireSessionUser();
  const [jobs, archivableCount] = await Promise.all([listJobs(), countArchivable()]);
  return (
    <JobList jobs={jobs} userRole={roleOf(user.email)} archivableCount={archivableCount} />
  );
}
