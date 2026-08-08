# String Management 🏸

A small mobile-first web app to track badminton racket stringing jobs. Each
racket moves through a fixed 7-step workflow, every step stamped with who did
it and when:

1. Racket received from customer (with racket + string specs) — **Front**
2. Racket handed over to Titon — **Front**
3. Racket received back from Titon — **Front**
4. Racket returned to owner — **Front**
5. Payment received — **Front**
6. Payment forwarded to Tasya — **Payee**
7. Payment confirmed received by Tasya — **Payee**

Each step belongs to exactly one role (Front, Stringer, Payee) — only someone
holding that role can advance or undo it; see [CLAUDE.md](CLAUDE.md) for the
full role model. Records live in **Neon Postgres** (connected through
Vercel's Storage tab). Deleted jobs are moved to a `deleted_jobs` table, never
destroyed. The list is searchable, sortable, and groupable, supports
bulk-advancing a filtered batch of same-status jobs in one tap, and can be
exported to a Google Sheet or downloaded as CSV. Jobs completed over a month
ago can be archived to a `/history` page to keep the active list short —
archiving never deletes anything. Sign-in is Google-only, restricted to an
allowlist of emails. Optional Web Push notifications tell each role when a
job needs them (see "Push notifications" below).

**Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS 4, Auth.js v5
(Google), Neon Postgres (`@neondatabase/serverless`), csv-stringify for
exports, web-push for notifications, Vitest.

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

### 3. Push notifications (optional)

Web Push tells each role when a job reaches a step they own — no app store,
no third-party service. Generate a VAPID keypair once:

```bash
npx web-push generate-vapid-keys
```

Put the output in `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, and set
`VAPID_SUBJECT` to a `mailto:` address or URL. Leave all three unset to skip
notifications entirely — the app works the same without them. Each user
enables notifications individually via the bell icon in the header (grants a
browser permission prompt). **On iPhone**, push only works after adding the
site to the Home Screen (Safari's Share sheet) — a plain Safari tab cannot
receive push notifications, per Apple's iOS restriction.

### 4. Deploy to Vercel

1. Push to GitHub, then [import the repo in Vercel](https://vercel.com/new).
2. In the Vercel project: **Storage → Create Database → Neon** (Marketplace),
   free plan, Singapore region, connect it to the project — this sets
   `DATABASE_URL` automatically.
3. **Settings → Environment Variables**: add `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS` (and optionally `FRONT_EMAILS`,
   `STRINGER_EMAILS`, `PAYEE_EMAILS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` — see `.env.example`).
4. Deploy, then add the production callback URL to the Google OAuth client
   (step 1.2 above) using your real Vercel domain.

## How data is stored

Neon Postgres, three tables: `jobs` (one row per stringing job, columns mirror
the historical CSV schema — see [data/records.sample.csv](data/records.sample.csv)),
`deleted_jobs` (deleted rows are moved there with a `deleted_at/by` audit
pair, never destroyed), and `push_subscriptions` (one row per opted-in
device, keyed by push endpoint — see "Push notifications" above). The schema
is created automatically on first use.
All access goes through [lib/repository.ts](lib/repository.ts); updates use
optimistic locking (`WHERE updated_at = <as read>`) so concurrent changes can
never silently overwrite each other. Every mutation updates
`updated_at`/`updated_by`, and each workflow step keeps its own `*_at`/`*_by`
audit pair. CSV lives on as the export format (download + Google Sheets),
and always includes both active and archived jobs (never `deleted_jobs`).

Completed (`DONE`) jobs older than 30 days can be archived: an `archived_at`/
`archived_by` pair is set on the same row (it never moves tables), which
simply drops it out of the active list's `WHERE archived_at IS NULL` query.
`/history` shows the rest with the same list UI. Nothing is ever deleted by
archiving.
