/**
 * Shown the moment a job card is tapped, while the server renders the page.
 * Every page here is force-dynamic, so a prefetch can't supply the data —
 * without this the browser sits on the previous screen with no feedback,
 * which is what "slow to open a job" felt like even once the data was quick.
 * Mirrors the real layout's boxes so the swap doesn't jump.
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-7 w-48 max-w-full rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-6 w-28 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between gap-3 py-1.5">
            <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-700/60" />
            <div className="h-4 w-32 rounded bg-slate-100 dark:bg-slate-700/60" />
          </div>
        ))}
      </div>

      <ol className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <li key={i} className="flex gap-3 pb-4 last:pb-0">
            <span className="h-7 w-7 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="min-w-0 flex-1 pt-1">
              <div className="h-4 w-40 max-w-full rounded bg-slate-100 dark:bg-slate-700/60" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
