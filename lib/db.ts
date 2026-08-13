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
  short_id text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  created_by text NOT NULL,
  customer_name text NOT NULL,
  racket_brand text NOT NULL DEFAULT '',
  racket_type text NOT NULL DEFAULT '',
  racket_color text NOT NULL DEFAULT '',
  own_string boolean NOT NULL DEFAULT false,
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

// own_string: customer supplied their own string, so string_type/color are
// blank — added after the initial release, so existing rows in both tables
// need the column backfilled (default false: prior jobs used shop string).
const OWN_STRING_COLUMN_SQL = `
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS own_string boolean NOT NULL DEFAULT false`;
const OWN_STRING_COLUMN_DELETED_SQL = OWN_STRING_COLUMN_SQL.replace(
  "ALTER TABLE jobs",
  "ALTER TABLE deleted_jobs"
);

// short_id: human-friendly "YYMMDD-NN" label (lib/repository.ts nextShortId),
// added after the initial release — existing rows keep the '' default until
// a one-off backfill (see scripts/backfill-short-ids.mjs) fills them in.
const SHORT_ID_COLUMN_SQL = `
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS short_id text NOT NULL DEFAULT ''`;
const SHORT_ID_COLUMN_DELETED_SQL = SHORT_ID_COLUMN_SQL.replace(
  "ALTER TABLE jobs",
  "ALTER TABLE deleted_jobs"
);

// One row per browser/device push subscription. A user can hold several
// (phone + desktop, or re-subscribing after clearing site data leaves the
// old endpoint stale until a failed send prunes it — see lib/push.ts).
const PUSH_SUBSCRIPTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY,
  email text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at text NOT NULL
)`;

// One row per calendar day (YYMMDD, from the job's received date), holding
// the last sequence number issued for that day. Incremented atomically via
// INSERT ... ON CONFLICT DO UPDATE ... RETURNING (see repository.ts
// nextShortId) — Postgres serializes concurrent upserts on the same key, so
// two simultaneous job creations can never receive the same short ID.
const JOB_SEQ_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS job_seq (
  day text PRIMARY KEY,
  n int NOT NULL
)`;

// Indexes for the two list queries, which both sort a filtered set. Partial
// indexes because the filter is exactly the split between the active list and
// history, so each index only carries the rows its own query reads.
const INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS jobs_active_created_idx
     ON jobs (created_at DESC) WHERE archived_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS jobs_archived_idx
     ON jobs (archived_at DESC) WHERE archived_at IS NOT NULL`,
];

// The table/column DDL, batched into ONE HTTP round-trip via sql.transaction()
// instead of nine sequential awaits. This runs on every cold start, and those
// nine Neon round-trips landing ahead of the first read were the dominant cost
// of a cold page load. Every statement is idempotent (IF NOT EXISTS), and the
// driver's HTTP endpoint accepts one statement per query — hence a batch of
// separate queries rather than a single semicolon-joined string.
const TABLE_STATEMENTS = [
  JOBS_TABLE_SQL,
  DELETED_TABLE_SQL,
  ARCHIVE_COLUMN_SQL,
  OWN_STRING_COLUMN_SQL,
  OWN_STRING_COLUMN_DELETED_SQL,
  SHORT_ID_COLUMN_SQL,
  SHORT_ID_COLUMN_DELETED_SQL,
  PUSH_SUBSCRIPTIONS_TABLE_SQL,
  JOB_SEQ_TABLE_SQL,
];

let schemaReady: Promise<void> | null = null;

/**
 * Creates the tables on first use (idempotent, cached per process).
 *
 * Callers should NOT await this before a plain read — see readSchemaGate() in
 * repository.ts. It stays awaited on the write paths, where a missing table
 * would otherwise fail a mutation.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = db();
      await sql.transaction(TABLE_STATEMENTS.map((s) => sql.query(s)));
      // CREATE INDEX cannot run inside a transaction, so the indexes go in
      // their own (single, parallel) statements after the tables exist.
      await Promise.all(INDEX_STATEMENTS.map((s) => sql.query(s)));
    })().catch((err) => {
      schemaReady = null; // allow a retry on the next request
      throw err;
    });
  }
  return schemaReady;
}

/**
 * Gate for READ paths: kick the schema setup off but don't wait for it.
 *
 * On a cold start the DDL is pure latency in front of a SELECT against tables
 * that have existed since the first deploy. A read that races it either
 * succeeds (the normal case) or fails with "relation does not exist" — which
 * only happens against a genuinely empty database, and the caller retries once
 * the schema promise settles. Writes still await ensureSchema() outright.
 */
export async function readSchemaGate(): Promise<void> {
  if (!schemaReady) void ensureSchema().catch(() => {});
}

/** Awaits the in-flight schema setup, for a read to retry after a miss. */
export function schemaSettled(): Promise<void> {
  return schemaReady ?? ensureSchema();
}

/** Postgres "relation ... does not exist" — the only error a read gate risks. */
export function isMissingRelationError(err: unknown): boolean {
  return (err as { code?: string })?.code === "42P01";
}
