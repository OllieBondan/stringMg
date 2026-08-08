import { shortUser } from "./format";
import { Role, Step } from "./types";

/**
 * Who holds each role, and what to call them. Configurable per-role via env
 * vars (comma-separated emails) so a role can be reassigned without a code
 * change; defaults match the current real team.
 */
const ROLE_ENV: Record<Role, string> = {
  front: "FRONT_EMAILS",
  stringer: "STRINGER_EMAILS",
  payee: "PAYEE_EMAILS",
};

const ROLE_DEFAULTS: Record<Role, string[]> = {
  front: ["ollie.bondan@gmail.com", "esti.bondan@gmail.com", "aisha.bondan@gmail.com"],
  stringer: ["titon@yonex.ch"],
  payee: ["alyssatasya@gmail.com"],
};

/** All emails currently holding a role — used to fan out push notifications. */
export function emailsForRole(role: Role): string[] {
  const raw = process.env[ROLE_ENV[role]];
  const list = raw ? raw.split(",") : ROLE_DEFAULTS[role];
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** The role a signed-in email holds, or null if they hold none (view-only). */
export function roleOf(email: string): Role | null {
  const e = email.toLowerCase();
  for (const role of ["front", "stringer", "payee"] as const) {
    if (emailsForRole(role).includes(e)) return role;
  }
  return null;
}

export function canActOnStep(email: string, step: Step): boolean {
  return roleOf(email) === step.role;
}

/** "ollie.bondan@gmail.com" -> "Agung". Falls back to the email's local part. */
const DISPLAY_NAMES: Record<string, string> = {
  "ollie.bondan@gmail.com": "Agung",
  "esti.bondan@gmail.com": "Esti",
  "aisha.bondan@gmail.com": "Aisha",
  "titon@yonex.ch": "Titon",
  "alyssatasya@gmail.com": "Tasya",
};

export function displayName(email: string): string {
  return DISPLAY_NAMES[email.toLowerCase()] ?? shortUser(email);
}
