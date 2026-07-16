"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate, shortUser } from "@/lib/format";
import { Job, statusRank } from "@/lib/types";
import StatusBadge, { STATUS_LABELS } from "./StatusBadge";

type SortKey = "newest" | "oldest" | "customer" | "status";
type GroupKey = "none" | "status" | "brand" | "customer";

const SORTERS: Record<SortKey, (a: Job, b: Job) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  customer: (a, b) => a.customerName.localeCompare(b.customerName),
  status: (a, b) => statusRank(a.status) - statusRank(b.status),
};

function groupLabel(job: Job, key: GroupKey): string {
  if (key === "status") return STATUS_LABELS[job.status];
  if (key === "brand") return job.racketBrand || "(no brand)";
  if (key === "customer") return job.customerName;
  return "";
}

export default function JobList({ jobs }: { jobs: Job[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [group, setGroup] = useState<GroupKey>("none");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? jobs.filter((j) =>
          [j.customerName, j.racketBrand, j.racketType, j.stringType]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : jobs;
    return [...filtered].sort(SORTERS[sort]);
  }, [jobs, query, sort]);

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
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer, racket, string…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
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
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
          aria-label="Group"
        >
          <option value="none">No grouping</option>
          <option value="status">Group: status</option>
          <option value="brand">Group: brand</option>
          <option value="customer">Group: customer</option>
        </select>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-500">{visible.length} record(s)</span>
        <span className="flex-1" />
        <button
          onClick={exportToSheet}
          disabled={exporting}
          className="font-medium text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export to Google Sheet"}
        </button>
        <a
          href="/api/download"
          className="font-medium text-emerald-700 underline-offset-2 hover:underline"
        >
          CSV
        </a>
      </div>
      {exportMsg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{exportMsg}</p>
      )}

      {jobs.length === 0 && (
        <p className="py-16 text-center text-slate-500">
          No records yet — tap <span className="font-semibold">+</span> to add the first racket.
        </p>
      )}

      {groups.map(([label, groupJobs]) => (
        <section key={label || "all"}>
          {label && (
            <h2 className="sticky top-14 z-10 -mx-1 mb-1 rounded bg-slate-100/95 px-1 py-1 text-sm font-semibold text-slate-600 backdrop-blur">
              {label} <span className="font-normal text-slate-400">({groupJobs.length})</span>
            </h2>
          )}
          <ul className="flex flex-col gap-2">
            {groupJobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{job.customerName}</span>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-600">
                    {[job.racketBrand, job.racketType, job.racketColor]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate">
                      {job.stringType}
                      {job.tensionValue && ` @ ${job.tensionValue} ${job.tensionUnit}`}
                    </span>
                    <span className="whitespace-nowrap" suppressHydrationWarning>
                      {formatDate(job.createdAt)} · {shortUser(job.createdBy)}
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
