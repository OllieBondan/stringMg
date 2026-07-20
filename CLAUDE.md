# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

A small mobile-first web app that tracks badminton racket stringing jobs
through a fixed 7-step workflow (received from customer → to Titon → back from
Titon → returned to owner → paid → forwarded to Tasya → confirmed received by
Tasya). Low volume (~2000 records), three users.

- **Stack:** Next.js 15 (App Router) + TypeScript, Tailwind CSS 4
- **Auth:** Auth.js (NextAuth v5), Google provider only, email allowlist
  (`ALLOWED_EMAILS`); only Tasya (`TASYA_EMAILS`) may confirm the final step
- **Storage:** Neon Postgres (`DATABASE_URL`), via `@neondatabase/serverless`
  — tables `jobs` and `deleted_jobs`, schema auto-created on first use
  (`lib/db.ts`). Migrated from a CSV-in-Vercel-Blob design in v2.0.0.
- **Hosting:** Vercel (GitHub repo: OllieBondan/stringMg)
- **Tests:** Vitest

## Storage history & rationale

v1 stored everything in one CSV in Vercel Blob. That design's revisit trigger
("if concurrent writers grow") fired: Blob's eventually-consistent reads with
multiple serverless instances caused stale 404s, false conflicts, and flicker,
requiring heavy CAS machinery. v2 moved to Neon Postgres: row-level atomic
guarded updates make that entire bug class impossible. CSV remains the
EXPORT format (download + Google Sheets), not the storage.

## Data Layer Rules

- ALL data access goes through `lib/repository.ts` — no SQL scattered
  across routes/components
- Timestamps are stored as **ISO-8601 text**, never timestamptz — the
  optimistic-concurrency check compares them for exact string equality, so
  nothing may convert them on the way in or out
- Mutations are optimistic-locked: full-row `UPDATE … WHERE id = ? AND
  updated_at = <as read>`; zero rows updated ⇒ concurrent change ⇒ retry or
  409. `expectedUpdatedAt` from the client detects user-level conflicts.
- Numeric-ish fields (tension) are stored and passed around as **strings**
- Deleting a job MOVES the row to `deleted_jobs` (single atomic CTE
  statement) — never plain-delete records
- Archiving (jobs DONE for >30 days) sets `archived_at`/`archived_by` on the
  SAME row (no move) — the active list filters `WHERE archived_at IS NULL`,
  `/history` shows the rest. CSV/Sheets export includes both (never filters
  on `archived_at`); only `deleted_jobs` is excluded from exports
- Bulk advance (`bulkAdvance` in `lib/repository.ts`) re-checks each job's
  current status before advancing it and skips (never forces) a job that
  moved on since the client read it — never trust a client-supplied status
  for more than "what I filtered by"
- Every mutation stamps `updated_at`/`updated_by`; each workflow step stores
  its own `*_at`/`*_by` audit pair. Step order is defined once in `STEPS`
  (`lib/types.ts`) — derive everything (status, next action, columns) from it
- Column set/order is defined once as `CSV_HEADER` (in `lib/csvRepository.ts`,
  re-exported by the repository) and mirrors the DB columns — schema changes
  must update `STEPS`/`CSV_HEADER`, the `lib/db.ts` CREATE TABLEs, and
  `data/records.sample.csv` together
- `lib/csvRepository.ts` + `lib/blobStore.ts` are LEGACY, kept only for the
  one-time `/api/admin/import-csv?run=1` migration route (and its tests).
  Remove all three together once the import is confirmed done in production.

## Project Structure

```
app/                 Pages (App Router) + API route handlers
  api/jobs/          List/create + per-job PATCH (advance/undo/updateSpecs)/DELETE
  api/jobs/bulk-advance/  Advance many same-status jobs one step at once
  api/jobs/archive-old/   Move DONE jobs completed >30 days ago into history
  api/export/        Creates a Google Sheet via the user's OAuth token
  api/download/      CSV download (generated from the DB, active + archived)
  api/admin/import-csv/  One-time legacy Blob CSV → Postgres import
  history/           Archived-jobs page (JobList in "history" variant)
components/          Client components (JobList, JobForm, JobDetail, StatusBadge)
lib/                 types.ts, options.ts, db.ts, repository.ts, permissions.ts,
                     auth.ts, session.ts, api.ts, format.ts (+ legacy csvRepository/blobStore)
data/
  records.sample.csv Reference/sample of the export schema
```

## Commands

```bash
npm run dev        # local dev server (DEV_NO_AUTH=1 skips Google login)
npm test           # Vitest unit tests
npm run build      # production build (includes type checking)
npm run typecheck  # tsc --noEmit
```

## Environment / tooling gotchas

- **Never run npm/next inside the Google Drive folder** (`G:\My Drive\...`) —
  the Drive filesystem breaks `npm install` and `.next` writes. Work from a
  local clone; GitHub is the sync mechanism.
- TypeScript must stay on **v5** (`typescript@5`) — Next 15 breaks with TS 7.
- **Volume test data**: `node scripts/seed-test-data.mjs [count]` (dry run —
  prints the target host, writes nothing) / `--force` to actually insert.
  NEVER run `--force` against production — point `.env.local`'s
  `DATABASE_URL` at a disposable **Neon branch** first (Neon console →
  Branches → create one from production, copy its connection string). The
  script always prints the target host so this is easy to double-check.
- `DATABASE_URL` (Neon) is required at runtime; without it the repository
  throws a descriptive error. Local dev uses the same Neon DB as production —
  there is no local database, so be deliberate with destructive testing.

## Testing

- Pure logic (steps/status/validation) is unit-tested; the SQL layer is
  verified by driving the dev server end-to-end against the real Neon DB
  (create → advance → conflict → delete), cleaning up test records after
- Legacy CSV tests (`lib/csvRepository.test.ts`) stay green until the legacy
  import path is removed

## Code Style

- Standard TypeScript/React conventions, functional components, 2-space indent
- Keep route handlers thin: parse/authz → call repository → map errors
  (`lib/api.ts`)
- No unnecessary abstraction — this is a small app; don't add layers/factories
  "for future flexibility" without a concrete near-term need

## What NOT to do

- Don't add an ORM — `@neondatabase/serverless` + explicit SQL is the ceiling
- Don't broaden the Google OAuth scopes beyond `drive.file`
- Don't store timestamps as anything but ISO text (see Data Layer Rules)
- Don't over-engineer for scale this app won't reach

## Workflow Notes

- Run `npm test` and `npm run build` before considering a change done
- Prefer small, reviewable diffs — show a plan before large refactors

## Versioning

- Semver lives in `package.json` and is shown on `/about` (with build date
  and commit, injected via `next.config.ts`)
- Before committing a set of changes, run `npm run bump` — it inspects
  commit subjects since the last `v*` tag and picks major/minor/patch
  (override with `npm run bump minor` etc.)
- Commit the bumped `package.json` together with the changes, then:
  `git tag v<version> && git push origin main --tags` — the tag is what the
  next bump measures against
- Versioning was reset to `0.1.1-beta` on 2026-07-18 (app entering active
  beta testing with the three real users) — earlier `v1.x`/`v2.x` tags in
  history predate the reset and are not part of the current sequence
