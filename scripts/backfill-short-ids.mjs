/**
 * One-off backfill: assigns a "YYMMDD-NN" short_id to every existing row
 * (both jobs and deleted_jobs) that doesn't have one yet — i.e. every job
 * created before the short-ID feature shipped. New jobs get their short_id
 * at creation time (lib/repository.ts nextShortId) and never need this.
 *
 * Rows are grouped by their received date (step1_received_at, falling back
 * to created_at for rows somehow missing it) and numbered in the order they
 * were received within that day, so the sequence reads naturally. job_seq
 * is seeded to the highest number issued per day, so any job created after
 * this backfill continues the same sequence rather than restarting at 1.
 *
 *   node scripts/backfill-short-ids.mjs --force
 *
 * Safe to run more than once — only rows with short_id = '' are touched.
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadDotEnvLocal();

const FORCE = process.argv.includes("--force");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set (checked process.env and .env.local).");
  process.exit(1);
}
const host = new URL(DATABASE_URL).hostname;
console.log(`Target database host: ${host}`);

const sql = neon(DATABASE_URL);

function shortIdFor(receivedIso, n) {
  const day = receivedIso.slice(2, 10).replace(/-/g, "");
  return { day, shortId: `${day}-${String(n).padStart(2, "0")}` };
}

/** Backfills one table in place; returns { updated, days }. */
async function backfillTable(table) {
  const rows = await sql.query(
    `SELECT id, created_at, step1_received_at FROM ${table} WHERE short_id = '' ORDER BY COALESCE(step1_received_at, created_at) ASC`
  );
  const dayCounters = new Map();
  const updates = [];
  for (const row of rows) {
    const receivedIso = row.step1_received_at || row.created_at;
    const day = receivedIso.slice(2, 10).replace(/-/g, "");
    const n = (dayCounters.get(day) ?? 0) + 1;
    dayCounters.set(day, n);
    updates.push({ id: row.id, shortId: shortIdFor(receivedIso, n).shortId });
  }
  console.log(`${table}: ${updates.length} row(s) to backfill across ${dayCounters.size} day(s).`);
  if (!FORCE) return { updated: 0, dayCounters };
  for (const u of updates) {
    await sql.query(`UPDATE ${table} SET short_id = $1 WHERE id = $2`, [u.shortId, u.id]);
  }
  return { updated: updates.length, dayCounters };
}

/** Merges per-day counts from jobs + deleted_jobs so job_seq starts past the highest issued. */
function mergeDayCounters(...maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [day, n] of map) merged.set(day, Math.max(merged.get(day) ?? 0, n));
  }
  return merged;
}

async function main() {
  if (!FORCE) {
    console.log("\nDry run — nothing written. Re-run with --force to actually update rows.");
  }
  const jobsResult = await backfillTable("jobs");
  const deletedResult = await backfillTable("deleted_jobs");

  if (!FORCE) {
    console.log("Double-check the host above before re-running with --force.");
    process.exit(0);
  }

  const dayCounters = mergeDayCounters(jobsResult.dayCounters, deletedResult.dayCounters);
  for (const [day, n] of dayCounters) {
    await sql.query(
      `INSERT INTO job_seq (day, n) VALUES ($1, $2)
       ON CONFLICT (day) DO UPDATE SET n = GREATEST(job_seq.n, $2)`,
      [day, n]
    );
  }
  console.log(
    `\nDone — backfilled ${jobsResult.updated} jobs row(s), ${deletedResult.updated} deleted_jobs row(s), seeded job_seq for ${dayCounters.size} day(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
