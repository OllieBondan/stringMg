export const TENSION_UNITS = ["Kg", "Lbs"] as const;
export type TensionUnit = (typeof TENSION_UNITS)[number];

/**
 * The three job roles. Every workflow step below belongs to exactly one —
 * only a user holding that role may advance or undo it (see lib/permissions.ts).
 * Stringer currently owns no step directly (Front confirms the physical
 * handoff back from stringing) — it's a view-only role in the workflow today.
 */
export const ROLES = ["front", "stringer", "payee"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  front: "Front Desk",
  stringer: "Stringer",
  payee: "Payee",
};

/**
 * The fixed 7-step workflow of a stringing job, in order.
 * `column` is the CSV export column prefix (`<column>_at` / `<column>_by`).
 * `role` is who may advance/undo this specific step.
 */
export const STEPS = [
  {
    key: "received",
    column: "step1_received",
    label: "Racket received from customer",
    action: "Mark racket received",
    status: "RECEIVED",
    role: "front",
  },
  {
    key: "toTiton",
    column: "step2_to_titon",
    label: "Handed over to Titon",
    action: "Hand over to Titon",
    status: "WITH_TITON",
    role: "front",
  },
  {
    key: "fromTiton",
    column: "step3_from_titon",
    label: "Received back from Titon",
    action: "Receive back from Titon",
    status: "STRUNG",
    role: "front",
  },
  {
    key: "returned",
    column: "step4_returned",
    label: "Returned to owner",
    action: "Return to owner",
    status: "RETURNED",
    role: "front",
  },
  {
    key: "paid",
    column: "step5_paid",
    label: "Payment received",
    action: "Record payment received",
    status: "PAID",
    role: "front",
  },
  {
    key: "forwarded",
    column: "step6_forwarded",
    label: "Payment forwarded to Tasya",
    action: "Forward payment to Tasya",
    status: "FORWARDED",
    role: "payee",
  },
  {
    key: "tasyaReceived",
    column: "step7_tasya_received",
    label: "Payment received by Tasya",
    action: "Confirm Tasya received payment",
    status: "DONE",
    role: "payee",
  },
] as const;

export type Step = (typeof STEPS)[number];
export type StepKey = Step["key"];
export type JobStatus = Step["status"];

export const STATUSES: JobStatus[] = STEPS.map((s) => s.status);

export interface StepStamp {
  at: string; // ISO-8601 UTC
  by: string; // Google account email
}

export interface Job {
  id: string;
  createdAt: string;
  createdBy: string;
  customerName: string;
  racketBrand: string;
  racketType: string;
  racketColor: string;
  ownString: boolean; // customer supplied their own string — stringType/Color are then blank
  stringType: string;
  stringColor: string;
  tensionValue: string; // kept as string end-to-end; validated numeric on input
  tensionUnit: TensionUnit;
  status: JobStatus;
  steps: Partial<Record<StepKey, StepStamp>>;
  notes: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * What the intake/edit form submits: the specs plus an optional received
 * date (YYYY-MM-DD) that sets/corrects the step-1 "received" stamp.
 */
export type JobSpecsInput = JobSpecs & { receivedDate?: string };

/** Editable intake/spec fields (everything except id, status, steps, audit). */
export interface JobSpecs {
  customerName: string;
  racketBrand: string;
  racketType: string;
  racketColor: string;
  ownString: boolean;
  stringType: string;
  stringColor: string;
  tensionValue: string;
  tensionUnit: TensionUnit;
  notes: string;
}

export function deriveStatus(steps: Job["steps"]): JobStatus {
  let status: JobStatus = "RECEIVED";
  for (const step of STEPS) {
    if (steps[step.key]) status = step.status;
  }
  return status;
}

/** The first step not yet stamped, or null when the job is fully done. */
export function nextStep(job: Job): Step | null {
  return STEPS.find((s) => !job.steps[s.key]) ?? null;
}

/** The most recently stamped step, or null when none are stamped. */
export function lastCompletedStep(job: Job): Step | null {
  const done = STEPS.filter((s) => job.steps[s.key]);
  return done.length > 0 ? done[done.length - 1] : null;
}

export function statusRank(status: JobStatus): number {
  return STEPS.findIndex((s) => s.status === status);
}
