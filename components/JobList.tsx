"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate, shortUser } from "@/lib/format";
import { Job, JobStatus, STATUSES, statusRank } from "@/lib/types";
import StatusBadge, { STATUS_LABELS } from "./StatusBadge";
import { useFreshData } from "./useFreshData";

type SortKey = "newest" | "oldest" | "customer" | "status";
type GroupKey = "none" | "status" | "brand" | "customer";

const ALL = "";

/** Job's business date: when the racket was received (falls back to creation). */
const jobDate = (j: Job) => j.steps.received?.at ?? j.createdAt;

const SORTERS: Record<SortKey, (a: Job, b: Job) => number> = {
  newest: (a, b) => jobDate(b).localeCompare(jobDate(a)),
  oldest: (a, b) => jobDate(a).localeCompare(jobDate(b)),
  customer: (a, b) => a.customerName.localeCompare(b.customerName),
  status: (a, b) => statusRank(a.status) - statusRank(b.status),
};

function groupLabel(job: Job, key: GroupKey): string {
  if (key === "status") return STATUS_LABELS[job.status];
  if (key === "brand") return job.racketBrand || "(no brand)";
  if (key === "customer") return job.customerName;
  return "";
}

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export default function JobList({ jobs }: { jobs: Job[] }) {
  useFreshData();
  const [nameQuery, setNameQuery] = useState("");
  const [racketTypeFilter, setRacketTypeFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<JobStatus | typeof ALL>(ALL);
  const [sort, setSort] = useState<SortKey>("newest");
  const [group, setGroup] = useState<GroupKey>("none");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const racketTypeOptions = useMemo(
    () =>
      [...new Set(jobs.map((j) => j.racketType).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [jobs]
  );

  const filtersActive = nameQuery.trim() !== "" || racketTypeFilter !== ALL || statusFilter !== ALL;

  function clearFilters() {
    setNameQuery("");
    setRacketTypeFilter(ALL);
    setStatusFilter(ALL);
  }

  const visible = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const filtered = jobs.filter((j) => {
      if (q && !j.customerName.toLowerCase().includes(q)) return false;
      if (racketTypeFilter !== ALL && j.racketType !== racketTypeFilter) return false;
      if (statusFilter !== ALL && j.status !== statusFilter) return false;
      return true;
    });
    return [...filtered].sort(SORTERS[sort]);
  }, [jobs, nameQuery, racketTypeFilter, statusFilter, sort]);

  const groups = useMemo(() => {
    if (group === "none") return [["", visible]] as [string, Job[]][];
    const map = new Map<string, Job[]>();
    for (const job of visible) {
      const label = groupLabel(job, group);
      map.set(label, [...(map.get(label) ?? []), job]);
    }
    return [...map.entries()];
  }, [visible, group]);

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
              Clear
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
            </select>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          {filtersActive ? `${visible.length} of ${jobs.length}` : visible.length} record(s)
        </span>
        <span className="flex-1" />
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
          CSV
        </a>
      </div>
      {exportMsg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
          {exportMsg}
        </p>
      )}

      {jobs.length === 0 && (
        <p className="py-16 text-center text-slate-500 dark:text-slate-400">
          No records yet — tap <span className="font-semibold">+</span> to add the first racket.
        </p>
      )}
      {jobs.length > 0 && visible.length === 0 && (
        <p className="py-16 text-center text-slate-500 dark:text-slate-400">
          No records match these filters.
        </p>
      )}

      {groups.map(([label, groupJobs]) => (
        <section key={label || "all"}>
          {label && (
            <h2 className="sticky top-14 z-10 -mx-1 mb-1 rounded bg-slate-100/95 px-1 py-1 text-sm font-semibold text-slate-600 backdrop-blur dark:bg-slate-900/95 dark:text-slate-300">
              {label} <span className="font-normal text-slate-400 dark:text-slate-500">({groupJobs.length})</span>
            </h2>
          )}
          <ul className="flex flex-col gap-2">
            {groupJobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:active:bg-slate-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{job.customerName}</span>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
                    {[job.racketBrand, job.racketType, job.racketColor]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate">
                      {job.stringType}
                      {job.tensionValue && ` @ ${job.tensionValue} ${job.tensionUnit}`}
                    </span>
                    <span className="whitespace-nowrap" suppressHydrationWarning>
                      {formatDate(jobDate(job))} · {shortUser(job.createdBy)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Link
        href="/jobs/new"
        aria-label="New job"
        className="fixed bottom-6 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-3xl font-light text-white shadow-lg hover:bg-emerald-700 active:scale-95"
      >
        +
      </Link>
    </div>
  );
}
