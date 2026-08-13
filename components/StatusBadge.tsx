import { JobStatus } from "@/lib/types";

export const STATUS_LABELS: Record<JobStatus, string> = {
  RECEIVED: "Received",
  WITH_TITON: "Being Strung",
  STRUNG: "Strung",
  RETURNED: "Returned, unpaid",
  PAID: "Payment Received",
  FORWARDED: "Payment Forwarded",
  DONE: "Done",
};

const STATUS_STYLES: Record<JobStatus, string> = {
  RECEIVED: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  WITH_TITON: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  STRUNG: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
  RETURNED: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  FORWARDED: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300",
  DONE: "bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white",
};

const STATUS_DOT: Record<JobStatus, string> = {
  RECEIVED: "bg-slate-500 dark:bg-slate-400",
  WITH_TITON: "bg-amber-500",
  STRUNG: "bg-sky-500",
  RETURNED: "bg-violet-500",
  PAID: "bg-emerald-500",
  FORWARDED: "bg-teal-500",
  DONE: "bg-white",
};

export default function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
