import { NextRequest, NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { removeSubscription } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const { endpoint } = await req.json();
    if (typeof endpoint !== "string") {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }
    await removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
