import { NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/** The public half of the VAPID keypair — safe to expose, needed by PushManager.subscribe. */
export async function GET() {
  try {
    await requireUser();
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return NextResponse.json({ error: "Push notifications are not configured" }, { status: 404 });
    }
    return NextResponse.json({ publicKey });
  } catch (err) {
    return toErrorResponse(err);
  }
}
