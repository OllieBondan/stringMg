import JobForm from "@/components/JobForm";
import { requireSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  await requireSessionUser();
  return <JobForm />;
}
