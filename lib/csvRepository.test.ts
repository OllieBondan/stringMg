import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlobStore, StoreConflictError, localFileStore } from "./blobStore";
import {
  CSV_HEADER,
  ConflictError,
  DELETED_CSV_HEADER,
  ForbiddenError,
  MalformedCsvError,
  NotFoundError,
  advanceStep,
  createJob,
  deleteJob,
  getJob,
  listJobs,
  readAll,
  undoLastStep,
  updateSpecs,
  writeAll,
} from "./csvRepository";
import { JobSpecs, STEPS } from "./types";

const SPECS: JobSpecs = {
  customerName: "Budi",
  racketBrand: "Yonex",
  racketType: "Astrox",
  racketColor: "Red",
  stringType: "Yonex BG80",
  stringColor: "White",
  tensionValue: "12",
  tensionUnit: "Kg",
  notes: "handle with care, includes \"quotes\", commas, and\nnewlines",
};

describe("csvRepository", () => {
  let dir: string;
  let file: string;
  let store: BlobStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "csv-repo-test-"));
    file = path.join(dir, "records.csv");
    store = localFileStore(file);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns [] when the file does not exist", async () => {
    expect(await readAll(store)).toEqual([]);
  });

  it("returns [] for a header-only file", async () => {
    await writeAll([], store);
    const content = await fs.readFile(file, "utf8");
    expect(content.trim()).toBe(CSV_HEADER.join(","));
    expect(await readAll(store)).toEqual([]);
  });

  it("creates a job with step 1 stamped and audit fields set", async () => {
    const job = await createJob(SPECS, "ollie@example.com", store);
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("RECEIVED");
    expect(job.steps.received?.by).toBe("ollie@example.com");
    expect(job.createdBy).toBe("ollie@example.com");
    expect(job.updatedBy).toBe("ollie@example.com");

    const roundtripped = await getJob(job.id, store);
    expect(roundtripped).toEqual(job);
  });

  it("round-trips fields containing quotes, commas and newlines", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    const read = await getJob(job.id, store);
    expect(read.notes).toBe(SPECS.notes);
  });

  it("advances through all seven steps to DONE", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    let current = job;
    for (let i = 1; i < STEPS.length; i++) {
      const actor = i === STEPS.length - 1 ? "alyssatasya@gmail.com" : `user${i}@b.c`;
      current = await advanceStep(job.id, actor, undefined, store);
    }
    expect(current.status).toBe("DONE");
    expect(current.steps.forwarded?.by).toBe("user5@b.c");
    expect(current.steps.tasyaReceived?.by).toBe("alyssatasya@gmail.com");
    await expect(advanceStep(job.id, "a@b.c", undefined, store)).rejects.toThrow(ConflictError);
  });

  it("reaches FORWARDED after step 6, before Tasya confirms", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    let current = job;
    for (let i = 1; i <= 5; i++) {
      current = await advanceStep(job.id, "a@b.c", undefined, store);
    }
    expect(current.status).toBe("FORWARDED");
  });

  it("migrates a legacy 6-step CSV, reopening old DONE jobs as FORWARDED", async () => {
    const iso = "2026-07-01T10:00:00.000Z";
    const legacyHeader = CSV_HEADER.filter((c) => !c.startsWith("step7_"));
    const values: Record<string, string> = {
      id: "legacy-1",
      customer_name: "Legacy Customer",
      racket_brand: "Yonex",
      racket_type: "Astrox",
      racket_color: "Red",
      string_type: "Yonex BG65",
      string_color: "White",
      tension_value: "11",
      tension_unit: "Kg",
      status: "DONE",
      notes: "",
    };
    const line = legacyHeader
      .map((c) => values[c] ?? (c.endsWith("_at") ? iso : "a@b.c"))
      .join(",");
    await fs.writeFile(file, `${legacyHeader.join(",")}\n${line}\n`, "utf8");

    const [job] = await readAll(store);
    expect(job.id).toBe("legacy-1");
    expect(job.status).toBe("FORWARDED"); // Tasya's confirmation now pending
    expect(job.steps.forwarded?.at).toBe(iso);
    expect(job.steps.tasyaReceived).toBeUndefined();

    // advancing writes the file back in the new 7-step schema
    const confirmed = await advanceStep("legacy-1", "alyssatasya@gmail.com", undefined, store);
    expect(confirmed.status).toBe("DONE");
    const content = await fs.readFile(file, "utf8");
    expect(content.split("\n")[0]).toBe(CSV_HEADER.join(","));
  });

  it("undoes the last step but never the intake step", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    await advanceStep(job.id, "a@b.c", undefined, store);
    const undone = await undoLastStep(job.id, "a@b.c", undefined, store);
    expect(undone.status).toBe("RECEIVED");
    await expect(undoLastStep(job.id, "a@b.c", undefined, store)).rejects.toThrow(ConflictError);
  });

  it("updates specs and the updated_* audit fields", async () => {
    const job = await createJob(SPECS, "creator@b.c", store);
    const updated = await updateSpecs(
      job.id,
      { ...SPECS, tensionValue: "13" },
      "editor@b.c",
      job.updatedAt,
      store
    );
    expect(updated.tensionValue).toBe("13");
    expect(updated.updatedBy).toBe("editor@b.c");
    expect(updated.createdBy).toBe("creator@b.c");
  });

  it("rejects a stale write with ConflictError", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    await advanceStep(job.id, "a@b.c", undefined, store);
    await expect(
      updateSpecs(job.id, SPECS, "a@b.c", job.updatedAt, store)
    ).rejects.toThrow("changed by someone else");
  });

  it("does not falsely conflict when expectedUpdatedAt matches exactly", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    const advanced = await advanceStep(job.id, "a@b.c", job.updatedAt, store);
    const again = await advanceStep(job.id, "a@b.c", advanced.updatedAt, store);
    expect(again.status).toBe("STRUNG");
  });

  it("reports syncing (not a false conflict) when the store lags behind the client", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    // client claims to have seen a NEWER version than the store has — that is
    // a stale replica, not a concurrent edit
    await expect(
      advanceStep(job.id, "a@b.c", "2999-01-01T00:00:00.000Z", store)
    ).rejects.toThrow("still syncing");
  });

  it("enforces conditional writes at the store level (CAS)", async () => {
    await writeAll([], store);
    const first = await store.read();
    await expect(store.write("changed", "wrong-etag")).rejects.toThrow(StoreConflictError);
    expect((await store.read())!.etag).toBe(first!.etag); // failed write changed nothing
    await store.write(`${CSV_HEADER.join(",")}\nchanged-content`, first!.etag); // correct etag succeeds
    const after = await store.read();
    expect(after!.etag).not.toBe(first!.etag);
  });

  it("moves a deleted job into the archive CSV and 404s on unknown ids", async () => {
    const archive = localFileStore(path.join(dir, "deleted.csv"));
    const job = await createJob(SPECS, "a@b.c", store);
    await deleteJob(job.id, "deleter@b.c", store, archive);
    expect(await listJobs(store)).toEqual([]);

    const archivedRows: string[][] = parse((await archive.read())!.content, {
      skip_empty_lines: true,
    });
    expect(archivedRows[0]).toEqual([...DELETED_CSV_HEADER]);
    expect(archivedRows).toHaveLength(2);
    expect(archivedRows[1][0]).toBe(job.id);
    expect(archivedRows[1][archivedRows[1].length - 1]).toBe("deleter@b.c");

    await expect(deleteJob(job.id, "deleter@b.c", store, archive)).rejects.toThrow(NotFoundError);
    await expect(getJob(job.id, store)).rejects.toThrow(NotFoundError);

    // a second deletion appends, never overwrites
    const job2 = await createJob({ ...SPECS, customerName: "Second" }, "a@b.c", store);
    await deleteJob(job2.id, "deleter@b.c", store, archive);
    const afterSecond: string[][] = parse((await archive.read())!.content, {
      skip_empty_lines: true,
    });
    expect(afterSecond).toHaveLength(3);
    expect(afterSecond[2][0]).toBe(job2.id);
  });

  it("only Tasya can confirm or undo the final payment step", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    let current = job;
    for (let i = 1; i <= 5; i++) current = await advanceStep(job.id, "a@b.c", undefined, store);
    expect(current.status).toBe("FORWARDED");

    await expect(advanceStep(job.id, "ollie@b.c", undefined, store)).rejects.toThrow(
      ForbiddenError
    );
    const done = await advanceStep(job.id, "alyssatasya@gmail.com", undefined, store);
    expect(done.status).toBe("DONE");

    await expect(undoLastStep(job.id, "ollie@b.c", undefined, store)).rejects.toThrow(
      ForbiddenError
    );
    const undone = await undoLastStep(job.id, "alyssatasya@gmail.com", undefined, store);
    expect(undone.status).toBe("FORWARDED");
  });

  it("fails loudly on a header mismatch", async () => {
    await fs.writeFile(file, "id,name\n1,x\n", "utf8");
    await expect(readAll(store)).rejects.toThrow(MalformedCsvError);
  });

  it("fails loudly on a row with the wrong column count", async () => {
    await writeAll([], store);
    await fs.appendFile(file, "some-id,too,few,columns\n", "utf8");
    await expect(readAll(store)).rejects.toThrow(MalformedCsvError);
  });

  it("fails loudly on an invalid status", async () => {
    const job = await createJob(SPECS, "a@b.c", store);
    const content = await fs.readFile(file, "utf8");
    await fs.writeFile(file, content.replace("RECEIVED", "BOGUS"), "utf8");
    await expect(getJob(job.id, store)).rejects.toThrow(MalformedCsvError);
  });

  it("serializes concurrent writes so none are lost", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createJob({ ...SPECS, customerName: `Customer ${i}` }, "a@b.c", store)
      )
    );
    expect(await listJobs(store)).toHaveLength(10);
  });

  it("rejects invalid input", async () => {
    await expect(createJob({ ...SPECS, customerName: "  " }, "a@b.c", store)).rejects.toThrow();
    await expect(createJob({ ...SPECS, tensionValue: "abc" }, "a@b.c", store)).rejects.toThrow();
  });

  it("backfills the received stamp when a past date is given", async () => {
    const job = await createJob({ ...SPECS, receivedDate: "2026-07-01" }, "a@b.c", store);
    expect(job.steps.received?.at).toBe("2026-07-01T12:00:00.000Z");
    const read = await getJob(job.id, store);
    expect(read.steps.received?.at).toBe("2026-07-01T12:00:00.000Z");
  });

  it("keeps the exact time when the received date is today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const job = await createJob({ ...SPECS, receivedDate: today }, "a@b.c", store);
    expect(job.steps.received?.at).toBe(job.createdAt);
  });

  it("corrects the received date via updateSpecs, preserving who received it", async () => {
    const job = await createJob(SPECS, "receiver@b.c", store);
    const updated = await updateSpecs(
      job.id,
      { ...SPECS, receivedDate: "2026-06-15" },
      "editor@b.c",
      job.updatedAt,
      store
    );
    expect(updated.steps.received).toEqual({ at: "2026-06-15T12:00:00.000Z", by: "receiver@b.c" });
  });

  it("rejects a malformed received date", async () => {
    await expect(
      createJob({ ...SPECS, receivedDate: "01-07-2026" }, "a@b.c", store)
    ).rejects.toThrow("Invalid received date");
  });
});
