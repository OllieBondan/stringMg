import JobList from "@/components/JobList";
import { listJobs } from "@/lib/csvRepository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const jobs = await listJobs();
  return <JobList jobs={jobs} />;
}
