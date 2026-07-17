import { redirect } from "next/navigation";
import { auth } from "./auth";

export interface SessionUser {
  email: string;
  name: string;
  accessToken?: string;
}

export function devBypassEnabled(): boolean {
  return process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV !== "production";
}

/**
 * The signed-in user, or null. With DEV_NO_AUTH=1 (local dev only) a fake
 * user is returned so the app can run without Google credentials.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (devBypassEnabled()) {
    return { email: "dev@local", name: "Dev User" };
  }
  let session;
  try {
    session = await auth();
  } catch (err) {
    // Next.js uses thrown errors with a digest for control flow
    // (redirects, dynamic-rendering bailouts) — always let those through.
    if (typeof (err as { digest?: unknown })?.digest === "string") throw err;
    // Misconfiguration (e.g. missing AUTH_SECRET) must not crash pages —
    // treat it as "not signed in" so the user lands on /login, which
    // explains exactly which env vars are missing.
    console.error("Auth configuration error", err);
    return null;
  }
  if (!session?.user?.email) return null;
  return {
    email: session.user.email,
    name: session.user.name ?? session.user.email,
    accessToken: session.accessToken,
  };
}

/**
 * Page-level auth guard (defense in depth on top of the middleware):
 * redirects to /login when there is no authorized session.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
