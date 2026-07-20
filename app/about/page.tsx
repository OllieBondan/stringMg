import Link from "next/link";

export const dynamic = "force-dynamic";

/** Public page — contains no record data, so it is excluded from the auth wall. */
export default function AboutPage() {
  const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const [versionCore, prerelease] = rawVersion.split("-");
  const version = prerelease
    ? `${versionCore} ${prerelease[0].toUpperCase()}${prerelease.slice(1)}`
    : versionCore;
  const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE;
  const sha = process.env.NEXT_PUBLIC_COMMIT_SHA;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-6 pt-10 text-center">
      <div className="text-6xl">🏸</div>
      <div>
        <h1 className="text-2xl font-bold">Stringing Tracker</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Badminton racket stringing tracker
        </p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-left text-sm dark:border-slate-700 dark:bg-slate-800">
        {row("Version", `v${version}`)}
        {buildDate &&
          row(
            "Built",
            new Date(buildDate).toLocaleString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          )}
        {sha &&
          row(
            "Commit",
            <a
              href={`https://github.com/OllieBondan/stringMg/commit/${sha}`}
              className="font-mono text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              {sha}
            </a>
          )}
        {row("Author", "Ollie Bondan")}
        {row(
          "Source",
          <a
            href="https://github.com/OllieBondan/stringMg"
            className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            GitHub
          </a>
        )}
      </div>

      <p className="max-w-sm text-xs text-slate-400 dark:text-slate-500">
        Records are kept in Neon Postgres, exportable as CSV or to Google Sheets.
        Built with Next.js — developed with Claude Code.
      </p>

      <Link
        href="/"
        className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
      >
        ← Back to the app
      </Link>
    </div>
  );
}
