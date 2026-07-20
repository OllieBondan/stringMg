import { neon } from "@neondatabase/serverless";
import { STEPS } from "./types";

type Sql = ReturnType<typeof neon>;

let sqlClient: Sql | null = null;

export function db(): Sql {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set — connect the Neon database to this project in the " +
          "Vercel dashboard (Storage tab) and redeploy, or add it to .env.local for local dev."
      );
    }
    sqlClient = neon(url);
  }
  return sqlClient;
}

// All timestamps are stored as ISO-8601 text, exactly as the app produces
// them — the optimistic-concurrency check compares them for string equality,
// so no type conversion may ever alter a value on the way in or out.
const STEP_COLUMNS = STEPS.map((s) => `${s.column}_at text, ${s.column}_by text`).join(",\n  ");

const JOBS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  created_at text NOT NULL,
  created_by text NOT NULL,
  customer_name text NOT NULL,
  racket_brand text NOT NULL DEFAULT '',
  racket_type text NOT NULL DEFAULT '',
  racket_color text NOT NULL DEFAULT '',
  string_type text NOT NULL DEFAULT '',
  string_color text NOT NULL DEFAULT '',
  tension_value text NOT NULL DEFAULT '',
  tension_unit text NOT NULL,
  status text NOT NULL,
  ${STEP_COLUMNS},
  notes text NOT NULL DEFAULT '',
  updated_at text NOT NULL,
  updated_by text NOT NULL
)`;

// deleted_jobs mirrors jobs EXACTLY (same columns, same order — the
// move-on-delete statement relies on it) plus the deletion audit pair.
const DELETED_TABLE_SQL = JOBS_TABLE_SQL.replace(
  "CREATE TABLE IF NOT EXISTS jobs (",
  "CREATE TABLE IF NOT EXISTS deleted_jobs ("
).replace(
  "updated_by text NOT NULL\n)",
  "updated_by text NOT NULL,\n  deleted_at text NOT NULL,\n  deleted_by text NOT NULL\n)"
);

// archived_at/by: set when a completed job is moved out of the active list
// into history (see repository.ts archiveOldCompleted). NULL = still active.
const ARCHIVE_COLUMN_SQL = `
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS archived_at text,
  ADD COLUMN IF NOT EXISTS archived_by text`;

let schemaReady: Promise<void> | null = null;

/** Creates the tables on first use (idempotent, cached per process). */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = db();
      await sql.query(JOBS_TABLE_SQL);
      await sql.query(DELETED_TABLE_SQL);
      await sql.query(ARCHIVE_COLUMN_SQL);
    })().catch((err) => {
      schemaReady = null; // allow a retry on the next request
      throw err;
    });
  }
  return schemaReady;
}
