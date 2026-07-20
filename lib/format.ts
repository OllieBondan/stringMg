export function formatDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "ollie.bondan@gmail.com" → "ollie.bondan" — compact display on mobile. */
export function shortUser(email: string): string {
  return email.split("@")[0];
}

/** YYYY-MM-DD in the local timezone, for <input type="date"> values. */
export function toDateInputValue(iso?: string): string {
  return (iso ? new Date(iso) : new Date()).toLocaleDateString("en-CA");
}

/**
 * "YYYY-MM-DD" (an <input type="date"> value) -> "DD/MM/YYYY", by splitting
 * the string rather than parsing it as a Date — a native date input's value
 * has no timezone, so going through Date/toLocaleDateString risks shifting
 * the day in negative-UTC-offset timezones. Used to overlay a fixed display
 * format on the date input, since its own on-screen text follows the
 * device's regional setting (e.g. mm/dd/yyyy on a US-locale phone) with no
 * way to control that natively.
 */
export function formatDMY(dateInputValue: string): string {
  const m = dateInputValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
