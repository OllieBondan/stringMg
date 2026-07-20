"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDateTime, shortUser } from "@/lib/format";
import { readJobOrder } from "@/lib/jobOrder";
import { Job, STEPS, lastCompletedStep, nextStep } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import { useFreshData } from "./useFreshData";

export default function JobDetail({
  job: initialJob,
  canConfirmTasya,
}: {
  job: Job;
  canConfirmTasya: boolean;
}) {
  useFreshData();
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [nav, setNav] = useState<{
    prevId: string | null;
    nextId: string | null;
    position: string | null;
  }>({ prevId: null, nextId: null, position: null });

  // Adopt server data from router.refresh() only when it is strictly NEWER —
  // a refresh served by a lagging replica must not roll the UI back to the
  // state before the click (visible as a sub-second status flicker).
  useEffect(() => {
    setJob((current) => (initialJob.updatedAt > current.updatedAt ? initialJob : current));
  }, [initialJob]);

  // Previous/Next through whichever list (active or history) was last
  // browsed in this tab — see lib/jobOrder.ts. Absent or stale order (direct
  // link, private browsing, filters changed since) just hides the row.
  useEffect(() => {
    const ids = readJobOrder();
    const idx = ids?.indexOf(initialJob.id) ?? -1;
    if (!ids || idx === -1) {
      setNav({ prevId: null, nextId: null, position: null });
      return;
    }
    setNav({
      prevId: idx > 0 ? ids[idx - 1] : null,
      nextId: idx < ids.length - 1 ? ids[idx + 1] : null,
      position: `${idx + 1} of ${ids.length}`,
    });
  }, [initialJob.id]);

  // Arriving via a link like /jobs/{id}#notes (e.g. the list's notes icon):
  // scroll straight to that field and flash it briefly so it's unmistakable.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(t);
  }, []);

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
      router.refresh(); // re-sync the displayed job, e.g. after a conflict
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

  const spec = (label: string, value: string, id?: string) =>
    value ? (
      <div
        id={id}
        className={`flex scroll-mt-16 justify-between gap-3 rounded-md py-1 transition-colors duration-500 ${
          id && highlightId === id ? "-mx-2 bg-amber-100 px-2 dark:bg-amber-900/30" : ""
        }`}
      >
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-right font-medium">{value}</span>
      </div>
    ) : null;

  const navButtonClass = (enabled: boolean) =>
    `flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
      enabled
        ? "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/50"
        : "pointer-events-none border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600"
    }`;

  return (
    <div className="flex flex-col gap-4">
      {(nav.prevId || nav.nextId) && (
        <div className="flex items-center gap-2">
          <Link
            href={nav.prevId ? `/jobs/${nav.prevId}` : "#"}
            aria-disabled={!nav.prevId}
            tabIndex={nav.prevId ? undefined : -1}
            className={navButtonClass(!!nav.prevId)}
          >
            ← Previous
          </Link>
          {nav.position && (
            <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
              {nav.position}
            </span>
          )}
          <Link
            href={nav.nextId ? `/jobs/${nav.nextId}` : "#"}
            aria-disabled={!nav.nextId}
            tabIndex={nav.nextId ? undefined : -1}
            className={navButtonClass(!!nav.nextId)}
          >
            Next →
          </Link>
        </div>
      )}

      <div className="flex gap-2">
        <Link
          href="/jobs/new"
          className="flex-1 rounded-lg border border-emerald-600 px-3 py-2 text-center text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
        >
          + Add another racket
        </Link>
        <Link
          href="/"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/50"
        >
          🏠 Main menu
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold">{job.customerName}</h1>
        <StatusBadge status={job.status} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
        {spec("Racket", [job.racketBrand, job.racketType].filter(Boolean).join(" "))}
        {spec("Racket color", job.racketColor)}
        {spec("String", job.stringType)}
        {spec("String color", job.stringColor)}
        {spec("Tension", job.tensionValue && `${job.tensionValue} ${job.tensionUnit}`)}
        {spec("Notes", job.notes, "notes")}
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
                    {last?.key === step.key &&
                      step.key !== "received" &&
                      (step.key !== "tasyaReceived" || canConfirmTasya) && (
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
                {isNext &&
                  (step.key === "tasyaReceived" && !canConfirmTasya ? (
                    <p className="mt-2 rounded-xl bg-slate-100 px-3 py-3 text-center text-sm text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
                      Waiting for Tasya to confirm she received the payment
                    </p>
                  ) : (
                    <button
                      onClick={() => patch("advance")}
                      disabled={busy}
                      className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700 active:scale-[.99] disabled:opacity-50"
                    >
                      {busy ? "Saving…" : step.action}
                    </button>
                  ))}
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
