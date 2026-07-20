import { NextRequest, NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { bulkAdvance } from "@/lib/repository";
import { JobStatus, STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Body: { ids: string[], fromStatus: JobStatus } — advances each id by one step. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { ids, fromStatus } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "ids must be a non-empty array of strings" }, { status: 400 });
    }
    if (!STATUSES.includes(fromStatus)) {
      return NextResponse.json({ error: "Invalid fromStatus" }, { status: 400 });
    }
    const results = await bulkAdvance(ids, fromStatus as JobStatus, user.email);
    return NextResponse.json({ results });
  } catch (err) {
    return toErrorResponse(err);
  }
}
