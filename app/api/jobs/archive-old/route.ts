import { NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { archiveOldCompleted } from "@/lib/repository";

export const dynamic = "force-dynamic";

/** Moves every DONE job completed over a month ago into history. */
export async function POST() {
  try {
    const user = await requireUser();
    const archived = await archiveOldCompleted(user.email);
    return NextResponse.json({ archived });
  } catch (err) {
    return toErrorResponse(err);
  }
}
