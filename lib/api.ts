import { NextResponse } from "next/server";
import { ConflictError, MalformedCsvError, NotFoundError } from "./csvRepository";
import { SessionUser, getSessionUser } from "./session";

export class UnauthorizedError extends Error {}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError("Sign in required");
  return user;
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof MalformedCsvError) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 400 });
}
