/**
 * Remembers the order jobs were last shown in on a list page (respecting
 * whatever sort/group/filter was active), so the detail page can offer
 * Previous/Next through exactly what the user was browsing. Session-scoped
 * (per tab) and best-effort — if storage is unavailable (private browsing)
 * or the id isn't found (stale/direct link), Previous/Next simply don't show.
 */
const KEY = "stringMgJobOrder";

export function saveJobOrder(ids: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable — Previous/Next just won't be offered
  }
}

export function readJobOrder(): string[] | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids : null;
  } catch {
    return null;
  }
}
