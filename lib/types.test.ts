import { describe, expect, it } from "vitest";
import {
  Job,
  STATUSES,
  STEPS,
  deriveStatus,
  lastCompletedStep,
  nextStep,
  statusRank,
} from "./types";

const STAMP = { at: "2026-01-01T00:00:00.000Z", by: "a@b.c" };

function jobWithSteps(...keys: (typeof STEPS)[number]["key"][]): Job {
  const steps: Job["steps"] = {};
  for (const k of keys) steps[k] = STAMP;
  return {
    id: "1",
    createdAt: STAMP.at,
    createdBy: STAMP.by,
    customerName: "Test",
    racketBrand: "",
    racketType: "",
    racketColor: "",
    ownString: false,
    stringType: "",
    stringColor: "",
    tensionValue: "",
    tensionUnit: "Kg",
    status: "RECEIVED",
    steps,
    notes: "",
    updatedAt: STAMP.at,
    updatedBy: STAMP.by,
  };
}

describe("STEPS/STATUSES", () => {
  it("has exactly 7 steps ending in DONE", () => {
    expect(STEPS).toHaveLength(7);
    expect(STEPS[STEPS.length - 1].status).toBe("DONE");
  });

  it("STATUSES mirrors STEPS order 1:1", () => {
    expect(STATUSES).toEqual(STEPS.map((s) => s.status));
  });
});

describe("deriveStatus", () => {
  it("is RECEIVED when no steps are stamped", () => {
    expect(deriveStatus({})).toBe("RECEIVED");
  });

  it("reflects the last stamped step in workflow order, not stamp order", () => {
    // stamped out of order — status must follow STEPS order, not insertion order
    const steps: Job["steps"] = { paid: STAMP, received: STAMP, toTiton: STAMP };
    expect(deriveStatus(steps)).toBe("PAID");
  });

  it("is DONE only once every step is stamped", () => {
    const all: Job["steps"] = {};
    for (const s of STEPS) all[s.key] = STAMP;
    expect(deriveStatus(all)).toBe("DONE");
  });
});

describe("nextStep / lastCompletedStep", () => {
  it("a fresh job's next step is received, with no completed step", () => {
    const job = jobWithSteps();
    expect(nextStep(job)?.key).toBe("received");
    expect(lastCompletedStep(job)).toBeNull();
  });

  it("advances one step at a time", () => {
    const job = jobWithSteps("received", "toTiton");
    expect(nextStep(job)?.key).toBe("fromTiton");
    expect(lastCompletedStep(job)?.key).toBe("toTiton");
  });

  it("a fully completed job has no next step", () => {
    const job = jobWithSteps(...STEPS.map((s) => s.key));
    expect(nextStep(job)).toBeNull();
    expect(lastCompletedStep(job)?.key).toBe("tasyaReceived");
  });
});

describe("statusRank", () => {
  it("orders statuses by workflow position", () => {
    expect(statusRank("RECEIVED")).toBe(0);
    expect(statusRank("DONE")).toBe(STEPS.length - 1);
    expect(statusRank("WITH_TITON")).toBeLessThan(statusRank("STRUNG"));
  });
});
