import { NextRequest, NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { createJob, listJobs } from "@/lib/csvRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(await listJobs());
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const specs = await req.json();
    const job = await createJob(specs, user.email);
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
