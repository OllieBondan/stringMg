import { notFound } from "next/navigation";
import JobForm from "@/components/JobForm";
import { NotFoundError, getJob } from "@/lib/csvRepository";
import { requireSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSessionUser();
  const { id } = await params;
  try {
    const job = await getJob(id);
    return <JobForm initial={job} />;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
