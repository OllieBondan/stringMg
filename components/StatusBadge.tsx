import { JobStatus } from "@/lib/types";

export const STATUS_LABELS: Record<JobStatus, string> = {
  RECEIVED: "Received",
  WITH_TITON: "With Titon",
  STRUNG: "Strung",
  RETURNED: "Returned",
  PAID: "Paid",
  DONE: "Done",
};

const STATUS_STYLES: Record<JobStatus, string> = {
  RECEIVED: "bg-slate-200 text-slate-700",
  WITH_TITON: "bg-amber-100 text-amber-800",
  STRUNG: "bg-sky-100 text-sky-800",
  RETURNED: "bg-violet-100 text-violet-800",
  PAID: "bg-emerald-100 text-emerald-800",
  DONE: "bg-emerald-600 text-white",
};

export default function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
