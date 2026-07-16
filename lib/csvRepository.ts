import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { BlobStore, getStore } from "./blobStore";
import {
  Job,
  JobSpecs,
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

export async function readAll(store: BlobStore = getStore()): Promise<Job[]> {
  const content = await store.read();
  if (content === null || content.trim() === "") return [];

  const rows: string[][] = parse(content, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true, // we validate column count ourselves, with a clear error
  });

  const [header, ...dataRows] = rows;
  if (header.join(",") !== CSV_HEADER.join(",")) {
    const msg = `CSV header mismatch — expected [${CSV_HEADER.join(",")}], got [${header.join(",")}]`;
    console.error(msg);
    throw new MalformedCsvError(msg);
  }

  try {
    // +2: 1-based line numbers, +1 for the header row
    return dataRows.map((row, i) => rowToJob(row, i + 2));
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function writeAll(jobs: Job[], store: BlobStore = getStore()): Promise<void> {
  const content = stringify([[...CSV_HEADER], ...jobs.map(jobToRow)]);
  await store.write(content);
}

// Serialize mutations within this process so concurrent requests can't
// interleave their read-modify-write cycles.
let mutationQueue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(fn, fn);
  mutationQueue = run.catch(() => {});
  return run;
}

export async function listJobs(store?: BlobStore): Promise<Job[]> {
  return readAll(store);
}

export async function getJob(id: string, store?: BlobStore): Promise<Job> {
  const job = (await readAll(store)).find((j) => j.id === id);
  if (!job) throw new NotFoundError(`Job ${id} not found`);
  return job;
}

function validateSpecs(specs: JobSpecs): void {
  if (!specs.customerName?.trim()) throw new Error("Customer name is required");
  if (!TENSION_UNITS.includes(specs.tensionUnit)) throw new Error("Invalid tension unit");
  if (specs.tensionValue !== "" && Number.isNaN(Number(specs.tensionValue))) {
    throw new Error("Tension must be a number");
  }
}

export async function createJob(specs: JobSpecs, user: string, store?: BlobStore): Promise<Job> {
  validateSpecs(specs);
  const now = new Date().toISOString();
  const job: Job = {
    id: crypto.randomUUID(),
    createdAt: now,
    createdBy: user,
    ...specs,
    customerName: specs.customerName.trim(),
    status: "RECEIVED",
    steps: { received: { at: now, by: user } },
    updatedAt: now,
    updatedBy: user,
  };
  await withLock(async () => {
    const jobs = await readAll(store);
    jobs.push(job);
    await writeAll(jobs, store);
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
    const jobs = await readAll(store);
    const job = jobs.find((j) => j.id === id);
    if (!job) throw new NotFoundError(`Job ${id} not found`);
    if (expectedUpdatedAt && expectedUpdatedAt !== job.updatedAt) {
      throw new ConflictError("Job was changed by someone else — reload and try again");
    }
    mutate(job);
    job.status = deriveStatus(job.steps);
    job.updatedAt = new Date().toISOString();
    job.updatedBy = user;
    await writeAll(jobs, store);
    return job;
  });
}

export async function updateSpecs(
  id: string,
  specs: JobSpecs,
  user: string,
  expectedUpdatedAt?: string,
  store?: BlobStore
): Promise<Job> {
  validateSpecs(specs);
  return mutateJob(id, expectedUpdatedAt, (job) => Object.assign(job, specs), user, store);
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
    const jobs = await readAll(store);
    const remaining = jobs.filter((j) => j.id !== id);
    if (remaining.length === jobs.length) throw new NotFoundError(`Job ${id} not found`);
    await writeAll(remaining, store);
  });
}

/** Raw CSV content for download/export (always includes the header row). */
export async function rawCsv(store: BlobStore = getStore()): Promise<string> {
  const content = await store.read();
  if (content === null || content.trim() === "") {
    return stringify([[...CSV_HEADER]]);
  }
  return content;
}
