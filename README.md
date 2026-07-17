# String Management 🏸

A small mobile-first web app to track badminton racket stringing jobs. Each
racket moves through a fixed 7-step workflow, every step stamped with who did
it and when:

1. Racket received from customer (with racket + string specs)
2. Racket handed over to Titon
3. Racket received back from Titon
4. Racket returned to owner
5. Payment received
6. Payment forwarded to Tasya
7. Payment confirmed received by Tasya (only she can tap this one)

Records live in **Neon Postgres** (connected through Vercel's Storage tab).
Deleted jobs are moved to a `deleted_jobs` table, never destroyed. The list is
searchable, sortable, and groupable, and can be exported to a Google Sheet or
downloaded as CSV. Sign-in is Google-only, restricted to an allowlist of
emails.

**Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS 4, Auth.js v5
(Google), Neon Postgres (`@neondatabase/serverless`), csv-stringify for
exports, Vitest.

## Local development

> ⚠️ **Don't run npm inside a Google Drive folder.** Google Drive's virtual
> filesystem cannot handle `npm install` / `.next` build writes (EBADF/EPERM
> errors). Clone the repo to a normal local folder (e.g. `C:\dev\stringMg`)
> and let **GitHub**, not Drive, be the sync mechanism.

```bash
git clone https://github.com/OllieBondan/stringMg.git
cd stringMg
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev                  # http://localhost:3000
npm test                     # repository unit tests
npm run build                # production build
```

Local dev talks to the **same Neon database as production** — copy
`DATABASE_URL` from the Vercel dashboard (Storage → your Neon DB → Quickstart)
into `.env.local`. There is no separate local database, so be deliberate when
testing destructive actions. To try the app without Google credentials, set
`DEV_NO_AUTH=1` in `.env.local` — login is skipped and changes are stamped as
`dev@local`. This bypass never works in production builds.

## Setup

### 1. Google OAuth client (required for login)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a
   project → **APIs & Services → OAuth consent screen**: External, add the
   allowlisted accounts as test users (or publish the app).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<your-app>.vercel.app/api/auth/callback/google`
3. Put the client ID/secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. **APIs & Services → Library**: enable the **Google Sheets API** (used by
   "Export to Google Sheet"). The app asks for the `drive.file` scope, which
   only lets it create/edit its own files — it cannot read your Drive.

### 2. Environment variables

See [.env.example](.env.example). Generate `AUTH_SECRET` with `npx auth secret`
or `openssl rand -base64 32`. `ALLOWED_EMAILS` is the comma-separated list of
Google accounts allowed to sign in.

### 3. Deploy to Vercel

1. Push to GitHub, then [import the repo in Vercel](https://vercel.com/new).
2. In the Vercel project: **Storage → Create Database → Neon** (Marketplace),
   free plan, Singapore region, connect it to the project — this sets
   `DATABASE_URL` automatically.
3. **Settings → Environment Variables**: add `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS` (and optionally `TASYA_EMAILS`).
4. Deploy, then add the production callback URL to the Google OAuth client
   (step 1.2 above) using your real Vercel domain.

## How data is stored

Neon Postgres, two tables: `jobs` (one row per stringing job, columns mirror
the historical CSV schema — see [data/records.sample.csv](data/records.sample.csv))
and `deleted_jobs` (deleted rows are moved there with a `deleted_at/by` audit
pair, never destroyed). The schema is created automatically on first use.
All access goes through [lib/repository.ts](lib/repository.ts); updates use
optimistic locking (`WHERE updated_at = <as read>`) so concurrent changes can
never silently overwrite each other. Every mutation updates
`updated_at`/`updated_by`, and each workflow step keeps its own `*_at`/`*_by`
audit pair. CSV lives on as the export format (download + Google Sheets).

### Migrating from the old CSV storage (one-time)

If upgrading from v1.x (CSV in Vercel Blob): keep `BLOB_READ_WRITE_TOKEN` set,
deploy v2, then open `/api/admin/import-csv?run=1` in the browser while signed
in. It copies all records into Postgres (idempotent — safe to repeat) and
leaves the Blob file untouched as a backup.
