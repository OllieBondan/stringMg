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
  const session = await auth();
  if (!session?.user?.email) return null;
  return {
    email: session.user.email,
    name: session.user.name ?? session.user.email,
    accessToken: session.accessToken,
  };
}
