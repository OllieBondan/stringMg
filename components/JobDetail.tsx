"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDateTime, shortUser } from "@/lib/format";
import { Job, STEPS, lastCompletedStep, nextStep } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import { useFreshData } from "./useFreshData";

export default function JobDetail({ job: initialJob }: { job: Job }) {
  useFreshData();
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adopt fresh server data when router.refresh() re-renders this page —
  // useState's initial value alone would keep showing the stale job.
  useEffect(() => setJob(initialJob), [initialJob]);

  const next = nextStep(job);
  const last = lastCompletedStep(job);

  async function patch(action: "advance" | "undo") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedUpdatedAt: job.updatedAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setJob(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete the job for ${job.customerName}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  const spec = (label: string, value: string) =>
    value ? (
      <div className="flex justify-between gap-3 py-1">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-right font-medium">{value}</span>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/"
            className="text-sm text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            ← All records
          </Link>
          <h1 className="mt-1 text-xl font-bold">{job.customerName}</h1>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
        {spec("Racket", [job.racketBrand, job.racketType].filter(Boolean).join(" "))}
        {spec("Racket color", job.racketColor)}
        {spec("String", job.stringType)}
        {spec("String color", job.stringColor)}
        {spec("Tension", job.tensionValue && `${job.tensionValue} ${job.tensionUnit}`)}
        {spec("Notes", job.notes)}
        <div className="mt-2 border-t border-slate-100 pt-2 text-right dark:border-slate-700">
          <Link
            href={`/jobs/${job.id}/edit`}
            className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            Edit details
          </Link>
        </div>
      </div>

      <ol className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        {STEPS.map((step, i) => {
          const stamp = job.steps[step.key];
          const isNext = next?.key === step.key;
          return (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < STEPS.length - 1 && (
                <span
                  className={`absolute left-[13px] top-7 h-full w-0.5 ${
                    stamp ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                />
              )}
              <span
                className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  stamp
                    ? "bg-emerald-500 text-white"
                    : isNext
                      ? "border-2 border-emerald-500 bg-white text-emerald-600 dark:bg-slate-800"
                      : "border-2 border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                }`}
              >
                {stamp ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium ${
                    stamp || isNext ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {step.label}
                </p>
                {stamp && (
                  <p className="text-xs text-slate-500 dark:text-slate-400" suppressHydrationWarning>
                    {formatDateTime(stamp.at)} · by {shortUser(stamp.by)}
                    {last?.key === step.key && step.key !== "received" && (
                      <>
                        {" · "}
                        <button
                          onClick={() => patch("undo")}
                          disabled={busy}
                          className="text-red-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-red-400"
                        >
                          undo
                        </button>
                      </>
                    )}
                  </p>
                )}
                {isNext && (
                  <button
                    onClick={() => patch("advance")}
                    disabled={busy}
                    className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700 active:scale-[.99] disabled:opacity-50"
                  >
                    {busy ? "Saving…" : step.action}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="text-xs text-slate-400 dark:text-slate-500" suppressHydrationWarning>
        Created {formatDateTime(job.createdAt)} by {shortUser(job.createdBy)} · Last change{" "}
        {formatDateTime(job.updatedAt)} by {shortUser(job.updatedBy)}
      </div>

      <button
        onClick={remove}
        disabled={busy}
        className="self-start text-sm font-medium text-red-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-red-400"
      >
        Delete job
      </button>
    </div>
  );
}
