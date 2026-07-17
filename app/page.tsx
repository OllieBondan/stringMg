import JobList from "@/components/JobList";
import { listJobs } from "@/lib/repository";
import { requireSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireSessionUser();
  const jobs = await listJobs();
  return <JobList jobs={jobs} />;
}
