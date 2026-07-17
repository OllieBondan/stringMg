# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

A small mobile-first web app that tracks badminton racket stringing jobs
through a fixed 6-step workflow (received from customer → to Titon → back from
Titon → returned to owner → paid → payment forwarded to Tasya). Data volume is
capped at ~2000 records, so we deliberately avoid a database engine.
Persistence is a single CSV file.

- **Stack:** Next.js 15 (App Router) + TypeScript, Tailwind CSS 4
- **Auth:** Auth.js (NextAuth v5), Google provider only, email allowlist
  (`ALLOWED_EMAILS`)
- **Storage:** one CSV file — Vercel Blob in production, `data/records.csv`
  on disk in local dev/tests, both behind `lib/blobStore.ts`
- **Hosting:** Vercel (GitHub repo: OllieBondan/stringMg)
- **Tests:** Vitest

## Why CSV, not a database

- Max ~2000 records, single-writer, low concurrency
- No need for complex queries, joins, or transactions
- Easy to inspect by hand, easy to back up, exports trivially to Google Sheets
- If requirements grow (concurrent writers, >10k records, relational queries),
  revisit this decision — don't prematurely add a DB before it's needed

## Data Layer Rules

- ALL CSV access goes through `lib/csvRepository.ts` — no file/blob I/O
  scattered across the codebase
- Always read the full file into memory, mutate, then write back atomically
  (temp file + rename locally; single blob `put` on Vercel). Mutations are
  serialized through the in-module lock (`withLock`)
- Validate row shape on read; fail loudly (log + throw `MalformedCsvError`)
  on malformed rows rather than silently skipping them
- Keep the header row; column order is defined once in `CSV_HEADER`
- Numeric-ish fields (tension) are stored and passed around as **strings** —
  never parse them into floats for storage
- One CSV file = one entity. A second entity would get a second file
- CSV parsing/serialization uses csv-parse/csv-stringify — never hand-rolled
  comma splitting
- Every mutation stamps `updated_at`/`updated_by`; each workflow step stores
  its own `*_at`/`*_by` audit pair. Step order is defined once in
  `STEPS` (`lib/types.ts`) — derive everything (status, next action, CSV
  columns) from it

## Project Structure

```
app/                 Pages (App Router) + API route handlers
  api/jobs/          List/create + per-job PATCH (advance/undo/updateSpecs)/DELETE
  api/export/        Creates a Google Sheet via the user's OAuth token
  api/download/      Raw CSV download
components/          Client components (JobList, JobForm, JobDetail, StatusBadge)
lib/                 types.ts, options.ts, blobStore.ts, csvRepository.ts,
                     auth.ts, session.ts, api.ts, format.ts
data/
  records.sample.csv Reference/sample data; the real file is never committed
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
- Windows: the local file store retries renames on EPERM/EBUSY; keep that.

## Testing

- Unit test the repository against a temp-dir file store (never the real
  data file) — see `lib/csvRepository.test.ts`
- Cover: missing file, header-only file, malformed rows, quoting/escaping
  round-trips, step advance/undo, stale-write conflicts, concurrent writes
- Prefer testing through the repository functions, not file internals

## Code Style

- Standard TypeScript/React conventions, functional components, 2-space indent
- Keep route handlers thin: parse/authz → call repository → map errors
  (`lib/api.ts`)
- No unnecessary abstraction — this is a small app; don't add layers/factories
  "for future flexibility" without a concrete near-term need

## What NOT to do

- Don't introduce a database (embedded or otherwise) without discussing it
  first — deliberate architectural choice, not an oversight
- Don't add an ORM
- Don't broaden the Google OAuth scopes beyond `drive.file`
- Don't over-engineer for scale this app won't reach

## Workflow Notes

- If a change touches the CSV schema: update `CSV_HEADER`/`STEPS`,
  `data/records.sample.csv`, and the tests together
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
