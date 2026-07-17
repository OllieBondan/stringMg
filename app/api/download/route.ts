import { requireUser, toErrorResponse } from "@/lib/api";
import { rawCsv } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const csv = await rawCsv();
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stringing-records-${stamp}.csv"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
