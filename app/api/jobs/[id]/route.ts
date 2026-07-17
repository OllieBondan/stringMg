import { NextRequest, NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { advanceStep, deleteJob, getJob, undoLastStep, updateSpecs } from "@/lib/csvRepository";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    return NextResponse.json(await getJob(id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Body: { action: "advance" | "undo" | "updateSpecs", specs?, expectedUpdatedAt? }
 * expectedUpdatedAt (the job's updated_at as last seen by the client) makes
 * the write fail with 409 if someone else changed the job in the meantime.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json();
    const { action, specs, expectedUpdatedAt } = body;

    if (action === "advance") {
      return NextResponse.json(await advanceStep(id, user.email, expectedUpdatedAt));
    }
    if (action === "undo") {
      return NextResponse.json(await undoLastStep(id, user.email, expectedUpdatedAt));
    }
    if (action === "updateSpecs") {
      return NextResponse.json(await updateSpecs(id, specs, user.email, expectedUpdatedAt));
    }
    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await deleteJob(id, user.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
