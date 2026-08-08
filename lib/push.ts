import webpush from "web-push";
import { emailsForRole } from "./permissions";
import { PushSubscription, removeSubscription, subscriptionsForEmails } from "./repository";
import { Role } from "./types";

let configured = false;

/** Registers VAPID keys with web-push once per process. No-op if unset. */
function ensureConfigured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Sends a push notification to every subscription belonging to `role`'s
 * members. Best-effort: a subscription that the push service reports as
 * gone (404/410 — uninstalled, cleared site data, etc.) is pruned so the
 * table self-cleans; any other send failure is logged and skipped, since a
 * notification is never worth failing the step-advance request over.
 */
export async function sendPushToRole(role: Role, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return; // VAPID not set up — silently a no-op
  const emails = emailsForRole(role);
  const subs = await subscriptionsForEmails(emails);
  await Promise.all(subs.map((sub) => sendOne(sub, payload)));
}

async function sendOne(sub: PushSubscription, payload: PushPayload): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await removeSubscription(sub.endpoint);
    } else {
      console.error("Push send failed", sub.endpoint, err);
    }
  }
}
