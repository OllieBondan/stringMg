/**
 * Who may confirm the final "payment received by Tasya" step.
 * Override with the TASYA_EMAILS env var (comma-separated) if it ever changes.
 */
export function tasyaEmails(): string[] {
  return (process.env.TASYA_EMAILS ?? "alyssatasya@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isTasya(email: string): boolean {
  return tasyaEmails().includes(email.toLowerCase());
}
