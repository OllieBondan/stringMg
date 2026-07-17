import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { BlobStore, StoreConflictError, getStore } from "./blobStore";
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
 * ALL CSV access goes through this module. Pattern: read the full file,
 * mutate in memory, write the whole file back atomically.
 */

export const CSV_HEADER = [
  "id",
  "created_at",
  "created_by",
  "customer_name",
  "racket_brand",
  "racket_type",
  "racket_color",
  "string_type",
  "string_color",
  "tension_value",
  "tension_unit",
  "status",
  ...STEPS.flatMap((s) => [`${s.column}_at`, `${s.column}_by`]),
  "notes",
  "updated_at",
  "updated_by",
] as const;

export class MalformedCsvError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}

function rowToJob(row: string[], rowNumber: number): Job {
  const get = (col: (typeof CSV_HEADER)[number]) => row[CSV_HEADER.indexOf(col)];

  const fail = (reason: string): never => {
    throw new MalformedCsvError(`Malformed CSV row ${rowNumber}: ${reason}`);
  };

  if (row.length !== CSV_HEADER.length) {
    fail(`expected ${CSV_HEADER.length} columns, got ${row.length}`);
  }

  const id = get("id");
  const status = get("status") as JobStatus;
  const tensionUnit = get("tension_unit") as TensionUnit;
  if (!id) fail("missing id");
  if (!get("created_at") || !get("created_by")) fail("missing created audit fields");
  if (!STATUSES.includes(status)) fail(`invalid status "${status}"`);
  if (!TENSION_UNITS.includes(tensionUnit)) fail(`invalid tension unit "${tensionUnit}"`);

  const steps: Job["steps"] = {};
  for (const step of STEPS) {
    const at = row[CSV_HEADER.indexOf(`${step.column}_at` as never)];
    const by = row[CSV_HEADER.indexOf(`${step.column}_by` as never)];
    if (at && by) steps[step.key] = { at, by };
    else if (at || by) fail(`step "${step.key}" has timestamp without user (or vice versa)`);
  }

  return {
    id,
    createdAt: get("created_at"),
    createdBy: get("created_by"),
    customerName: get("customer_name"),
    racketBrand: get("racket_brand"),
    racketType: get("racket_type"),
    racketColor: get("racket_color"),
    stringType: get("string_type"),
    stringColor: get("string_color"),
    tensionValue: get("tension_value"),
    tensionUnit,
    status,
    steps,
    notes: get("notes"),
    updatedAt: get("updated_at"),
    updatedBy: get("updated_by"),
  };
}

function jobToRow(job: Job): string[] {
  const stepCols = STEPS.flatMap((s) => {
    const stamp = job.steps[s.key];
    return [stamp?.at ?? "", stamp?.by ?? ""];
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
    ...stepCols,
    job.notes,
    job.updatedAt,
    job.updatedBy,
  ];
}

/** The schema before the step-7 "payment received by Tasya" step was added. */
const LEGACY_CSV_HEADER = CSV_HEADER.filter((c) => !c.startsWith("step7_"));

function parseJobs(content: string): Job[] {
  if (content.trim() === "") return [];

  const rows: string[][] = parse(content, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true, // we validate column count ourselves, with a clear error
  });

  let [header, ...dataRows] = rows;
  let legacy = false;
  if (header.join(",") === LEGACY_CSV_HEADER.join(",")) {
    // Migrate 6-step rows in place: empty step-7 columns, status re-derived
    // (their "DONE" meant forwarded — Tasya's confirmation is now pending).
    legacy = true;
    const insertAt = CSV_HEADER.indexOf("step7_tasya_received_at" as never);
    dataRows = dataRows.map((row) => [...row.slice(0, insertAt), "", "", ...row.slice(insertAt)]);
  } else if (header.join(",") !== CSV_HEADER.join(",")) {
    const msg = `CSV header mismatch — expected [${CSV_HEADER.join(",")}], got [${header.join(",")}]`;
    console.error(msg);
    throw new MalformedCsvError(msg);
  }

  try {
    // +2: 1-based line numbers, +1 for the header row
    const jobs = dataRows.map((row, i) => rowToJob(row, i + 2));
    if (legacy) for (const job of jobs) job.status = deriveStatus(job.steps);
    return jobs;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

interface CsvState {
  jobs: Job[];
  /** Version marker of the content these jobs were parsed from. */
  etag?: string;
}

async function readState(store: BlobStore = getStore()): Promise<CsvState> {
  const result = await store.read();
  if (result === null) return { jobs: [] };
  return { jobs: parseJobs(result.content), etag: result.etag };
}

export async function readAll(store?: BlobStore): Promise<Job[]> {
  return (await readState(store)).jobs;
}

export async function writeAll(
  jobs: Job[],
  store: BlobStore = getStore(),
  ifMatch?: string
): Promise<void> {
  const content = stringify([[...CSV_HEADER], ...jobs.map(jobToRow)]);
  await store.write(content, ifMatch);
}

// Serialize mutations within this process so concurrent requests can't
// interleave their read-modify-write cycles.
let mutationQueue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(fn, fn);
  mutationQueue = run.catch(() => {});
  return run;
}

// Cross-instance safety: every mutation is a compare-and-swap — read the CSV
// with its version, apply the change, write conditionally (ifMatch). If the
// store changed in between (another instance wrote), or our read was a stale
// replica, the conditional write fails and the whole cycle retries on
// fresh(er) data. Correctness never depends on read freshness.
const CAS_ATTEMPTS = 5;
const CAS_DELAY_MS = Number(process.env.CSV_CAS_DELAY_MS ?? 500);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when committed; false when the store moved on and we must retry. */
async function tryCommit(
  jobs: Job[],
  store: BlobStore | undefined,
  etag?: string
): Promise<boolean> {
  try {
    await writeAll(jobs, store ?? getStore(), etag);
    return true;
  } catch (err) {
    if (err instanceof StoreConflictError) return false;
    throw err;
  }
}

export async function listJobs(store?: BlobStore): Promise<Job[]> {
  return readAll(store);
}

export async function getJob(id: string, store?: BlobStore): Promise<Job> {
  const job = (await readAll(store)).find((j) => j.id === id);
  if (!job) throw new NotFoundError(`Job ${id} not found`);
  return job;
}

/**
 * getJob with brief retries — right after a create, a different serverless
 * instance can still see the pre-write CSV for a moment (Blob overwrites
 * propagate eventually), which used to 404 the just-created job's page.
 */
export async function getJobWithRetry(
  id: string,
  attempts = 3,
  delayMs = 700,
  store?: BlobStore
): Promise<Job> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getJob(id, store);
    } catch (err) {
      if (!(err instanceof NotFoundError) || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
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

export async function createJob(input: JobSpecsInput, user: string, store?: BlobStore): Promise<Job> {
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
  await withLock(async () => {
    for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
      const { jobs, etag } = await readState(store);
      if (await tryCommit([...jobs, job], store, etag)) return;
      await sleep(CAS_DELAY_MS);
    }
    throw new ConflictError("Storage is busy — please try again");
  });
  return job;
}

async function mutateJob(
  id: string,
  expectedUpdatedAt: string | undefined,
  mutate: (job: Job) => void,
  user: string,
  store?: BlobStore
): Promise<Job> {
  return withLock(async () => {
    for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
      const { jobs, etag } = await readState(store);
      const job = jobs.find((j) => j.id === id);
      const isLastAttempt = attempt === CAS_ATTEMPTS;

      // A missing job or an older-than-expected updatedAt usually means this
      // read was a stale replica (the client literally saw a newer version) —
      // wait for propagation instead of failing with a false conflict.
      if (!job) {
        if (isLastAttempt) throw new NotFoundError(`Job ${id} not found`);
        await sleep(CAS_DELAY_MS);
        continue;
      }
      if (expectedUpdatedAt && job.updatedAt < expectedUpdatedAt) {
        if (isLastAttempt) {
          throw new ConflictError("Storage is still syncing — please try again in a moment");
        }
        await sleep(CAS_DELAY_MS);
        continue;
      }
      // A strictly newer updatedAt is a real concurrent change by someone else.
      if (expectedUpdatedAt && job.updatedAt > expectedUpdatedAt) {
        throw new ConflictError("Job was changed by someone else — reload and try again");
      }

      mutate(job);
      job.status = deriveStatus(job.steps);
      job.updatedAt = new Date().toISOString();
      job.updatedBy = user;
      if (await tryCommit(jobs, store, etag)) return job;
      await sleep(CAS_DELAY_MS);
    }
    throw new ConflictError("Storage is busy — please try again");
  });
}

export async function updateSpecs(
  id: string,
  input: JobSpecsInput,
  user: string,
  expectedUpdatedAt?: string,
  store?: BlobStore
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
    user,
    store
  );
}

export async function advanceStep(
  id: string,
  user: string,
  expectedUpdatedAt?: string,
  store?: BlobStore
): Promise<Job> {
  return mutateJob(
    id,
    expectedUpdatedAt,
    (job) => {
      const step = nextStep(job);
      if (!step) throw new ConflictError("Job is already complete");
      job.steps[step.key] = { at: new Date().toISOString(), by: user };
    },
    user,
    store
  );
}

export async function undoLastStep(
  id: string,
  user: string,
  expectedUpdatedAt?: string,
  store?: BlobStore
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
      delete job.steps[step.key];
    },
    user,
    store
  );
}

export async function deleteJob(id: string, store?: BlobStore): Promise<void> {
  await withLock(async () => {
    for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
      const { jobs, etag } = await readState(store);
      const remaining = jobs.filter((j) => j.id !== id);
      if (remaining.length === jobs.length) {
        // possibly a stale replica that doesn't show the job yet
        if (attempt === CAS_ATTEMPTS) throw new NotFoundError(`Job ${id} not found`);
        await sleep(CAS_DELAY_MS);
        continue;
      }
      if (await tryCommit(remaining, store, etag)) return;
      await sleep(CAS_DELAY_MS);
    }
    throw new ConflictError("Storage is busy — please try again");
  });
}

/** Raw CSV content for download/export (always includes the header row). */
export async function rawCsv(store: BlobStore = getStore()): Promise<string> {
  const result = await store.read();
  if (result === null || result.content.trim() === "") {
    return stringify([[...CSV_HEADER]]);
  }
  return result.content;
}
