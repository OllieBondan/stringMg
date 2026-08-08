import { NextRequest, NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { saveSubscription } from "@/lib/repository";

export const dynamic = "force-dynamic";

/** Body: the browser's PushSubscription.toJSON() shape — { endpoint, keys: { p256dh, auth } }. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    await saveSubscription({ endpoint, email: user.email, p256dh, auth });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
