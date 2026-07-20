import { stringify } from "csv-stringify/sync";
import { CSV_HEADER, jobToRow } from "./csvRepository";
import { db, ensureSchema } from "./db";
import { isTasya } from "./permissions";
import {
  Job,
  JobSpecs,
  JobSpecsInput,
  JobStatus,
  STATUSES,
  STEPS,
  TENSION_UNITS,
  TensionUnit,
  deriveStatus,
  lastCompletedStep,
  nextStep,
} from "./types";

/**
 * Postgres (Neon) data layer — one row per stringing job, columns mirroring
 * the historical CSV schema (see CSV_HEADER). All timestamps are ISO text.
 * Concurrency: optimistic locking — updates are guarded by
 * `WHERE updated_at = <as read>`, so a lost update is impossible.
 */

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ForbiddenError extends Error {}

export { CSV_HEADER };

type Row = Record<string, string | null>;

function rowToJob(row: Row): Job {
  const steps: Job["steps"] = {};
  for (const step of STEPS) {
    const at = row[`${step.column}_at`];
    const by = row[`${step.column}_by`];
    if (at && by) steps[step.key] = { at, by };
  }
  return {
    id: row.id ?? "",
    createdAt: row.created_at ?? "",
    createdBy: row.created_by ?? "",
    customerName: row.customer_name ?? "",
    racketBrand: row.racket_brand ?? "",
    racketType: row.racket_type ?? "",
    racketColor: row.racket_color ?? "",
    stringType: row.string_type ?? "",
    stringColor: row.string_color ?? "",
    tensionValue: row.tension_value ?? "",
    tensionUnit: (row.tension_unit ?? "Kg") as TensionUnit,
    status: (row.status ?? "RECEIVED") as JobStatus,
    steps,
    notes: row.notes ?? "",
    updatedAt: row.updated_at ?? "",
    updatedBy: row.updated_by ?? "",
  };
}

/** Column values in CSV_HEADER order — used by INSERT (which lists columns explicitly). */
function jobValues(job: Job): (string | null)[] {
  const stepValues = STEPS.flatMap((s) => {
    const stamp = job.steps[s.key];
    return [stamp?.at ?? null, stamp?.by ?? null];
  });
  return [
    job.id,
    job.createdAt,
    job.createdBy,
    job.customerName,
    job.racketBrand,
    job.racketType,
    job.racketColor,
    job.stringType,
    job.stringColor,
    job.tensionValue,
    job.tensionUnit,
    job.status,
    ...stepValues,
    job.notes,
    job.updatedAt,
    job.updatedBy,
  ];
}

const COLUMN_LIST = CSV_HEADER.join(", ");
const PLACEHOLDERS = CSV_HEADER.map((_, i) => `$${i + 1}`).join(", ");

export async function insertJob(job: Job, onConflictIgnore = false): Promise<boolean> {
  await ensureSchema();
  const conflictClause = onConflictIgnore ? " ON CONFLICT (id) DO NOTHING" : "";
  const rows = await db().query(
    `INSERT INTO jobs (${COLUMN_LIST}) VALUES (${PLACEHOLDERS})${conflictClause} RETURNING id`,
    jobValues(job)
  );
  return (rows as Row[]).length > 0;
}

/** Guarded full-row update: succeeds only if the row is still at guardUpdatedAt. */
async function updateJobRow(job: Job, guardUpdatedAt: string): Promise<boolean> {
  const assignments = CSV_HEADER.filter((c) => c !== "id")
    .map((c, i) => `${c} = $${i + 1}`)
    .join(", ");
  const values = jobValues(job).slice(1); // all but id
  const rows = await db().query(
    `UPDATE jobs SET ${assignments} WHERE id = $${values.length + 1} AND updated_at = $${values.length + 2} RETURNING id`,
    [...values, job.id, guardUpdatedAt]
  );
  return (rows as Row[]).length > 0;
}

export async function listJobs(): Promise<Job[]> {
  await ensureSchema();
  const rows = (await db().query(
    "SELECT * FROM jobs WHERE archived_at IS NULL ORDER BY created_at DESC"
  )) as Row[];
  return rows.map(rowToJob);
}

export interface ArchivedJob extends Job {
  archivedAt: string;
}

/** Completed jobs moved out of the active list (see archiveOldCompleted). */
export async function listArchivedJobs(): Promise<ArchivedJob[]> {
  await ensureSchema();
  const rows = (await db().query(
    "SELECT * FROM jobs WHERE archived_at IS NOT NULL ORDER BY archived_at DESC"
  )) as Row[];
  return rows.map((r) => ({ ...rowToJob(r), archivedAt: r.archived_at ?? "" }));
}

export async function getJob(id: string): Promise<Job> {
  await ensureSchema();
  const rows = (await db().query("SELECT * FROM jobs WHERE id = $1", [id])) as Row[];
  if (rows.length === 0) throw new NotFoundError(`Job ${id} not found`);
  return rowToJob(rows[0]);
}

function validateSpecs(specs: JobSpecs): void {
  if (!specs.customerName?.trim()) throw new Error("Customer name is required");
  if (!TENSION_UNITS.includes(specs.tensionUnit)) throw new Error("Invalid tension unit");
  if (specs.tensionValue !== "" && Number.isNaN(Number(specs.tensionValue))) {
    throw new Error("Tension must be a number");
  }
}

/**
 * ISO stamp for the "received" step. A backfilled calendar day is stored as
 * noon UTC so it renders as that same date in any timezone; the current day
 * keeps the exact time.
 */
function receivedStamp(receivedDate: string | undefined, fallbackIso: string): string {
  if (!receivedDate) return fallbackIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) throw new Error("Invalid received date");
  if (fallbackIso.slice(0, 10) === receivedDate) return fallbackIso;
  return `${receivedDate}T12:00:00.000Z`;
}

export async function createJob(input: JobSpecsInput, user: string): Promise<Job> {
  const { receivedDate, ...specs } = input;
  validateSpecs(specs);
  const now = new Date().toISOString();
  const job: Job = {
    id: crypto.randomUUID(),
    createdAt: now,
    createdBy: user,
    ...specs,
    customerName: specs.customerName.trim(),
    status: "RECEIVED",
    steps: { received: { at: receivedStamp(receivedDate, now), by: user } },
    updatedAt: now,
    updatedBy: user,
  };
  await insertJob(job);
  return job;
}

async function mutateJob(
  id: string,
  expectedUpdatedAt: string | undefined,
  mutate: (job: Job) => void,
  user: string
): Promise<Job> {
  // Two attempts: the guarded UPDATE can only fail if another request wrote
  // between our read and write — the re-read then either reveals a genuine
  // user-level conflict or lets an unconditional action (no expectedUpdatedAt)
  // reapply cleanly.
  for (let attempt = 1; ; attempt++) {
    const job = await getJob(id);
    if (expectedUpdatedAt && job.updatedAt !== expectedUpdatedAt) {
      throw new ConflictError("Job was changed by someone else — reload and try again");
    }
    const guard = job.updatedAt;
    mutate(job);
    job.status = deriveStatus(job.steps);
    job.updatedAt = new Date().toISOString();
    job.updatedBy = user;
    if (await updateJobRow(job, guard)) return job;
    if (attempt >= 3) throw new ConflictError("Job was changed by someone else — reload and try again");
  }
}

export async function updateSpecs(
  id: string,
  input: JobSpecsInput,
  user: string,
  expectedUpdatedAt?: string
): Promise<Job> {
  const { receivedDate, ...specs } = input;
  validateSpecs(specs);
  return mutateJob(
    id,
    expectedUpdatedAt,
    (job) => {
      Object.assign(job, specs);
      if (receivedDate) {
        const current = job.steps.received;
        job.steps.received = {
          at: receivedStamp(receivedDate, current?.at ?? new Date().toISOString()),
          by: current?.by ?? user,
        };
      }
    },
    user
  );
}

export async function advanceStep(
  id: string,
  user: string,
  expectedUpdatedAt?: string
): Promise<Job> {
  return mutateJob(
    id,
    expectedUpdatedAt,
    (job) => {
      const step = nextStep(job);
      if (!step) throw new ConflictError("Job is already complete");
      if (step.key === "tasyaReceived" && !isTasya(user)) {
        throw new ForbiddenError("Only Tasya can confirm that the payment was received");
      }
      job.steps[step.key] = { at: new Date().toISOString(), by: user };
    },
    user
  );
}

export async function undoLastStep(
  id: string,
  user: string,
  expectedUpdatedAt?: string
): Promise<Job> {
  return mutateJob(
    id,
    expectedUpdatedAt,
    (job) => {
      const step = lastCompletedStep(job);
      if (!step) throw new ConflictError("No step to undo");
      if (step.key === "received") {
        throw new ConflictError("Cannot undo the intake step — delete the job instead");
      }
      if (step.key === "tasyaReceived" && !isTasya(user)) {
        throw new ForbiddenError("Only Tasya can undo her payment confirmation");
      }
      delete job.steps[step.key];
    },
    user
  );
}

/**
 * Moves the row into deleted_jobs and removes it from jobs, atomically.
 * Columns are named explicitly (not `moved.*`) because jobs has columns
 * (archived_at/by) that deleted_jobs intentionally doesn't — once deleted,
 * archive state is irrelevant, so it isn't carried over.
 */
export async function deleteJob(id: string, user: string): Promise<void> {
  await ensureSchema();
  const rows = (await db().query(
    `WITH moved AS (DELETE FROM jobs WHERE id = $1 RETURNING ${COLUMN_LIST})
     INSERT INTO deleted_jobs (${COLUMN_LIST}, deleted_at, deleted_by)
     SELECT ${COLUMN_LIST}, $2, $3 FROM moved RETURNING id`,
    [id, new Date().toISOString(), user]
  )) as Row[];
  if (rows.length === 0) throw new NotFoundError(`Job ${id} not found`);
}

/** The full record set as CSV, active and archived alike (never deleted). */
export async function rawCsv(): Promise<string> {
  await ensureSchema();
  const rows = (await db().query("SELECT * FROM jobs ORDER BY created_at DESC")) as Row[];
  return stringify([[...CSV_HEADER], ...rows.map(rowToJob).map(jobToRow)]);
}

/** Advances every listed job by one step, if it is still at fromStatus. */
export interface BulkAdvanceResult {
  id: string;
  ok: boolean;
  status?: JobStatus;
  error?: string;
}

export async function bulkAdvance(
  ids: string[],
  fromStatus: JobStatus,
  user: string
): Promise<BulkAdvanceResult[]> {
  const results: BulkAdvanceResult[] = [];
  for (const id of ids) {
    try {
      const job = await getJob(id);
      if (job.status !== fromStatus) {
        results.push({ id, ok: false, error: "Status changed — skipped" });
        continue;
      }
      const updated = await advanceStep(id, user);
      results.push({ id, ok: true, status: updated.status });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return results;
}

/** Jobs eligible to leave the active list: DONE and completed over a month ago. */
const ARCHIVE_AFTER_DAYS = 30;
const archiveCutoffIso = () =>
  new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

export async function countArchivable(): Promise<number> {
  await ensureSchema();
  const rows = (await db().query(
    `SELECT count(*)::int AS n FROM jobs
     WHERE status = 'DONE' AND step7_tasya_received_at IS NOT NULL
       AND step7_tasya_received_at < $1 AND archived_at IS NULL`,
    [archiveCutoffIso()]
  )) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** Moves every eligible job into history in one statement; returns how many. */
export async function archiveOldCompleted(user: string): Promise<number> {
  await ensureSchema();
  const rows = (await db().query(
    `UPDATE jobs SET archived_at = $1, archived_by = $2
     WHERE status = 'DONE' AND step7_tasya_received_at IS NOT NULL
       AND step7_tasya_received_at < $3 AND archived_at IS NULL
     RETURNING id`,
    [new Date().toISOString(), user, archiveCutoffIso()]
  )) as Row[];
  return rows.length;
}

/** Validation helper for the one-time CSV import (kept strict on purpose). */
export function assertImportableJob(job: Job): void {
  if (!job.id) throw new Error("Job without id");
  if (!STATUSES.includes(job.status)) throw new Error(`Invalid status ${job.status}`);
}
