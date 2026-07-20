import { JobStatus } from "@/lib/types";

export const STATUS_LABELS: Record<JobStatus, string> = {
  RECEIVED: "Received",
  WITH_TITON: "Being Strung",
  STRUNG: "Strung",
  RETURNED: "Returned, waiting for payment",
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

export default function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
