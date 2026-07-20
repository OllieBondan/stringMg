"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDate, shortUser } from "@/lib/format";
import { saveJobOrder } from "@/lib/jobOrder";
import { Job, JobStatus, STATUSES, STEPS, statusRank } from "@/lib/types";
import StatusBadge, { STATUS_LABELS } from "./StatusBadge";
import { useFreshData } from "./useFreshData";

type JobWithArchive = Job & { archivedAt?: string };
type SortKey = "newest" | "oldest" | "customer" | "status";
type GroupKey = "none" | "status" | "brand" | "customer" | "month";

const ALL = "";

function monthLabel(iso: string): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export default function JobList({
  jobs,
  variant = "active",
  canConfirmTasya = false,
  archivableCount = 0,
}: {
  jobs: JobWithArchive[];
  variant?: "active" | "history";
  canConfirmTasya?: boolean;
  archivableCount?: number;
}) {
  useFreshData();
  const router = useRouter();
  const [nameQuery, setNameQuery] = useState("");
  const [racketBrandFilter, setRacketBrandFilter] = useState<string>(ALL);
  const [racketTypeFilter, setRacketTypeFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<JobStatus | typeof ALL>(ALL);
  const [sort, setSort] = useState<SortKey>("newest");
  const [group, setGroup] = useState<GroupKey>("none");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  // The job's headline date: when it was received (active list) or when it
  // left the active list (history) — falls back sensibly either way.
  const dateOf = (j: JobWithArchive) =>
    variant === "history" ? j.archivedAt || j.updatedAt : (j.steps.received?.at ?? j.createdAt);

  const SORTERS = useMemo<Record<SortKey, (a: Job, b: Job) => number>>(
    () => ({
      newest: (a, b) => dateOf(b).localeCompare(dateOf(a)),
      oldest: (a, b) => dateOf(a).localeCompare(dateOf(b)),
      customer: (a, b) => a.customerName.localeCompare(b.customerName),
      status: (a, b) => statusRank(a.status) - statusRank(b.status),
    }),
    [variant]
  );

  function groupLabel(job: JobWithArchive, key: GroupKey): string {
    if (key === "status") return STATUS_LABELS[job.status];
    if (key === "brand") return job.racketBrand || "(no brand)";
    if (key === "customer") return job.customerName;
    // updatedAt, not dateOf/archivedAt — archiving happens as one batch
    // action, so grouping by archive date would collapse many months of
    // real completion history into whichever day "Archive" was last clicked.
    if (key === "month") return monthLabel(job.updatedAt);
    return "";
  }

  const racketBrandOptions = useMemo(
    () =>
      [...new Set(jobs.map((j) => j.racketBrand).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [jobs]
  );

  const racketTypeOptions = useMemo(
    () =>
      [...new Set(jobs.map((j) => j.racketType).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [jobs]
  );

  const filtersActive =
    nameQuery.trim() !== "" ||
    racketBrandFilter !== ALL ||
    racketTypeFilter !== ALL ||
    statusFilter !== ALL;

  function clearFilters() {
    setNameQuery("");
    setRacketBrandFilter(ALL);
    setRacketTypeFilter(ALL);
    setStatusFilter(ALL);
  }

  const visible = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const filtered = jobs.filter((j) => {
      if (q && !j.customerName.toLowerCase().includes(q)) return false;
      if (racketBrandFilter !== ALL && j.racketBrand !== racketBrandFilter) return false;
      if (racketTypeFilter !== ALL && j.racketType !== racketTypeFilter) return false;
      if (statusFilter !== ALL && j.status !== statusFilter) return false;
      return true;
    });
    return [...filtered].sort(SORTERS[sort]);
  }, [jobs, nameQuery, racketBrandFilter, racketTypeFilter, statusFilter, sort, SORTERS]);

  const groups = useMemo(() => {
    if (group === "none") return [["", visible]] as [string, JobWithArchive[]][];
    const map = new Map<string, JobWithArchive[]>();
    for (const job of visible) {
      const label = groupLabel(job, group);
      map.set(label, [...(map.get(label) ?? []), job]);
    }
    return [...map.entries()];
  }, [visible, group]);

  // Remember the exact on-screen order (post filter/sort/group) so the
  // detail page can offer Previous/Next through what's actually visible here.
  useEffect(() => {
    saveJobOrder(groups.flatMap(([, js]) => js.map((j) => j.id)));
  }, [groups]);

  // --- Bulk advance (active list only): every visible job already shares
  // statusFilter once one is chosen, so selection needs no extra grouping.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const statusIndex = statusFilter ? STEPS.findIndex((s) => s.status === statusFilter) : -1;
  const nextStepDef = statusIndex >= 0 && statusIndex < STEPS.length - 1 ? STEPS[statusIndex + 1] : null;
  const selectAvailable = variant === "active" && nextStepDef !== null;
  const bulkForbidden = nextStepDef?.key === "tasyaReceived" && !canConfirmTasya;

  useEffect(() => {
    setSelected(new Set());
    if (!selectAvailable) setSelectMode(false);
  }, [statusFilter, selectAvailable]);

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkAdvanceSelected() {
    if (!nextStepDef || selected.size === 0 || bulkForbidden) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/jobs/bulk-advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], fromStatus: statusFilter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk update failed");
      const results: { id: string; ok: boolean }[] = data.results;
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      setBulkMsg(
        failCount === 0
          ? `Advanced ${plural(okCount, "job")} to ${STATUS_LABELS[nextStepDef.status]}.`
          : `Advanced ${plural(okCount, "job")}; ${plural(failCount, "job")} skipped (changed in the meantime).`
      );
      setSelected(new Set());
      setSelectMode(false);
      router.refresh();
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function archiveOld() {
    if (
      !confirm(
        `Archive ${plural(archivableCount, "job")} completed over a month ago? They'll move to History — nothing is deleted.`
      )
    )
      return;
    setArchiving(true);
    try {
      const res = await fetch("/api/jobs/archive-old", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Archive failed");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  async function exportToSheet() {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch("/api/export", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export failed");
      window.open(data.url, "_blank");
      setExportMsg(`Exported ${data.rows} record(s) to a new Google Sheet.`);
    } catch (err) {
      setExportMsg(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function renderCardBody(job: JobWithArchive) {
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold">{job.customerName}</span>
            {job.notes && (
              <span
                role="button"
                tabIndex={0}
                aria-label="This job has notes — view them"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/jobs/${job.id}#notes`);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/jobs/${job.id}#notes`);
                }}
                className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs leading-none text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              >
                📝
              </span>
            )}
          </span>
          <StatusBadge status={job.status} />
        </div>
        <div className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
          {[job.racketBrand, job.racketType, job.racketColor].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">
            {job.stringType}
            {job.tensionValue && ` @ ${job.tensionValue} ${job.tensionUnit}`}
          </span>
          <span className="whitespace-nowrap" suppressHydrationWarning>
            {variant === "history"
              ? `Archived ${formatDate(dateOf(job))}`
              : `${formatDate(dateOf(job))} · ${shortUser(job.createdBy)}`}
          </span>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Filter by customer name…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={racketBrandFilter}
            onChange={(e) => setRacketBrandFilter(e.target.value)}
            className={selectClass}
            aria-label="Filter by racket brand"
          >
            <option value={ALL}>All racket brands</option>
            {racketBrandOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={racketTypeFilter}
            onChange={(e) => setRacketTypeFilter(e.target.value)}
            className={selectClass}
            aria-label="Filter by racket type"
          >
            <option value={ALL}>All racket types</option>
            {racketTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as JobStatus | typeof ALL)}
            className={selectClass}
            aria-label="Filter by status"
          >
            <option value={ALL}>All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              onClick={clearFilters}
              className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              Clear filters
            </button>
          )}
          {variant === "active" && (
            <button
              onClick={() => setSelectMode((v) => !v)}
              disabled={!selectAvailable}
              title={
                selectAvailable
                  ? "Select jobs to advance them together"
                  : "Filter by a status (not Done) to enable bulk actions"
              }
              className={`rounded-lg border px-2 py-2 text-sm font-medium disabled:opacity-40 ${
                selectMode
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              {selectMode ? "Cancel select" : "Select"}
            </button>
          )}
          <span className="ms-auto flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={selectClass}
              aria-label="Sort"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="customer">By customer</option>
              <option value="status">By status</option>
            </select>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as GroupKey)}
              className={selectClass}
              aria-label="Group"
            >
              <option value="none">No grouping</option>
              <option value="status">Group: status</option>
              <option value="brand">Group: brand</option>
              <option value="customer">Group: customer</option>
              {variant === "history" && <option value="month">Group: month</option>}
            </select>
          </span>
        </div>
      </div>

      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
          <span className="text-slate-600 dark:text-slate-300">
            {selected.size} selected
            {selected.size < visible.length && (
              <button
                onClick={() => setSelected(new Set(visible.map((j) => j.id)))}
                className="ml-2 font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              >
                Select all {visible.length}
              </button>
            )}
          </span>
          <span className="flex-1" />
          {bulkForbidden ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Only Tasya can confirm this step
            </span>
          ) : (
            <button
              onClick={bulkAdvanceSelected}
              disabled={selected.size === 0 || bulkBusy}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white disabled:opacity-40"
            >
              {bulkBusy ? "Working…" : `${nextStepDef?.action} (${selected.size})`}
            </button>
          )}
        </div>
      )}
      {bulkMsg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
          {bulkMsg}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          {filtersActive
            ? `${visible.length} of ${plural(jobs.length, "record")}`
            : plural(visible.length, "record")}
        </span>
        <span className="flex-1" />
        {variant === "active" && (
          <Link
            href="/history"
            className="font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
          >
            🕘 History
          </Link>
        )}
        {variant === "history" && (
          <Link
            href="/"
            className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            ← Active jobs
          </Link>
        )}
        <button
          onClick={exportToSheet}
          disabled={exporting}
          className="font-medium text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-400"
        >
          {exporting ? "Exporting…" : "Export to Google Sheet"}
        </button>
        <a
          href="/api/download"
          className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          Download CSV
        </a>
      </div>
      {exportMsg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
          {exportMsg}
        </p>
      )}

      {variant === "active" && archivableCount > 0 && (
        <button
          onClick={archiveOld}
          disabled={archiving}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/50"
        >
          {archiving
            ? "Archiving…"
            : `📦 Archive ${plural(archivableCount, "completed job")} older than 1 month`}
        </button>
      )}

      {jobs.length === 0 && (
        <p className="py-16 text-center text-slate-500 dark:text-slate-400">
          {variant === "history" ? (
            "No archived jobs yet — completed jobs older than a month can be archived from the main list."
          ) : (
            <>
              No records yet — tap <span className="font-semibold">+</span> to add the first
              racket.
            </>
          )}
        </p>
      )}
      {jobs.length > 0 && visible.length === 0 && (
        <p className="py-16 text-center text-slate-500 dark:text-slate-400">
          No records match these filters.
        </p>
      )}

      {groups.map(([label, groupJobs]) => {
        // Month groups answer "how many did X get strung last month" too:
        // a per-customer tally under the header, tap a name to drill in.
        const customerTally =
          group === "month"
            ? [...groupJobs.reduce((map, j) => map.set(j.customerName, (map.get(j.customerName) ?? 0) + 1), new Map<string, number>())].sort(
                (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
              )
            : null;
        return (
        <section key={label || "all"}>
          {label && (
            <h2 className="sticky top-14 z-10 -mx-1 mb-1 rounded bg-slate-100/95 px-1 py-1 text-sm font-semibold text-slate-600 backdrop-blur dark:bg-slate-900/95 dark:text-slate-300">
              {label} <span className="font-normal text-slate-400 dark:text-slate-500">({groupJobs.length})</span>
            </h2>
          )}
          {customerTally && customerTally.length > 0 && (
            <p className="mb-1.5 flex flex-wrap gap-x-1 gap-y-0.5 px-1 text-xs text-slate-500 dark:text-slate-400">
              {customerTally.map(([name, n]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setNameQuery(name)}
                  className="rounded hover:text-emerald-700 hover:underline dark:hover:text-emerald-400"
                >
                  {name} ({n})
                </button>
              ))}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {groupJobs.map((job) => (
              <li key={job.id}>
                {selectMode ? (
                  <button
                    type="button"
                    onClick={() => toggleSelect(job.id)}
                    className={`block w-full rounded-xl border p-3 text-left shadow-sm ${
                      selected.has(job.id)
                        ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900/20"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                          selected.has(job.id)
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300 dark:border-slate-500"
                        }`}
                      >
                        {selected.has(job.id) ? "✓" : ""}
                      </span>
                      <div className="min-w-0 flex-1">{renderCardBody(job)}</div>
                    </div>
                  </button>
                ) : (
                  <Link
                    href={`/jobs/${job.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700"
                  >
                    {renderCardBody(job)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
        );
      })}

      {variant === "active" && (
        <Link
          href="/jobs/new"
          aria-label="New job"
          className="fixed bottom-6 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-3xl font-light text-white shadow-lg hover:bg-emerald-700 active:scale-95"
        >
          +
        </Link>
      )}
    </div>
  );
}
