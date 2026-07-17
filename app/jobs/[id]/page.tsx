import { notFound } from "next/navigation";
import JobDetail from "@/components/JobDetail";
import { NotFoundError, getJob } from "@/lib/repository";
import { isTasya } from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  const { id } = await params;
  try {
    const job = await getJob(id);
    return <JobDetail job={job} canConfirmTasya={isTasya(user.email)} />;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
