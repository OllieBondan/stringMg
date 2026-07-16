# String Management 🏸

A small mobile-first web app to track badminton racket stringing jobs. Each
racket moves through a fixed 6-step workflow, every step stamped with who did
it and when:

1. Racket received from customer (with racket + string specs)
2. Racket handed over to Titon
3. Racket received back from Titon
4. Racket returned to owner
5. Payment received
6. Payment forwarded to Tasya

Records live in a single CSV file (max ~2000 rows — deliberately no database),
stored in Vercel Blob in production. The list is searchable, sortable, and
groupable, and can be exported to a Google Sheet or downloaded as CSV.
Sign-in is Google-only, restricted to an allowlist of emails.

**Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS 4, Auth.js v5
(Google), Vercel Blob, csv-parse/csv-stringify, Vitest.

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

Without a `BLOB_READ_WRITE_TOKEN`, local dev stores data in `data/records.csv`
on disk (gitignored). To try the app without Google credentials, set
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
2. In the Vercel project: **Storage → Create → Blob** and connect it — this
   sets `BLOB_READ_WRITE_TOKEN` automatically.
3. **Settings → Environment Variables**: add `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS`.
4. Deploy, then add the production callback URL to the Google OAuth client
   (step 1.2 above) using your real Vercel domain.

> Note: Vercel Blob serves files over public (unguessable) URLs. The CSV holds
> customer names and racket specs — low sensitivity — but don't put anything
> secret in it.

## How data is stored

One CSV file = one table, header row always present
(see [data/records.sample.csv](data/records.sample.csv)). All access goes
through [lib/csvRepository.ts](lib/csvRepository.ts): read the whole file,
validate every row (fail loudly on malformed data), mutate in memory, write
back atomically. Every mutation updates `updated_at`/`updated_by`, and each
workflow step keeps its own `*_at`/`*_by` audit pair.
