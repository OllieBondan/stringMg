import { NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { CSV_HEADER, listJobs } from "@/lib/repository";
import { STEPS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Creates a new Google Sheet in the signed-in user's Drive containing all
 * records, using their own OAuth token (drive.file scope). Returns the URL.
 */
export async function POST() {
  try {
    const user = await requireUser();
    if (!user.accessToken) {
      return NextResponse.json(
        {
          error:
            "No Google access token in this session — sign out and sign in again. " +
            "(With DEV_NO_AUTH=1 the export is unavailable; use CSV download instead.)",
        },
        { status: 400 }
      );
    }

    const jobs = await listJobs();
    const values: string[][] = [
      [...CSV_HEADER],
      ...jobs.map((job) => [
        job.id,
        job.createdAt,
        job.createdBy,
        job.customerName,
        job.racketBrand,
        job.racketType,
        job.racketColor,
        job.stringType,
        job.stringColor,
        job.tensionValue,
        job.tensionUnit,
        job.status,
        ...STEPS.flatMap((s) => {
          const stamp = job.steps[s.key];
          return [stamp?.at ?? "", stamp?.by ?? ""];
        }),
        job.notes,
        job.updatedAt,
        job.updatedBy,
      ]),
    ];

    const authHeaders = {
      Authorization: `Bearer ${user.accessToken}`,
      "Content-Type": "application/json",
    };

    const title = `Stringing Records ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ properties: { title } }),
    });
    const sheet = await createRes.json();
    if (!createRes.ok) {
      console.error("Sheets create failed", sheet);
      return NextResponse.json(
        { error: sheet.error?.message ?? "Failed to create Google Sheet" },
        { status: 502 }
      );
    }

    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ majorDimension: "ROWS", values }),
      }
    );
    if (!updateRes.ok) {
      const detail = await updateRes.json();
      console.error("Sheets values update failed", detail);
      return NextResponse.json(
        { error: detail.error?.message ?? "Failed to write data into the Google Sheet" },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: sheet.spreadsheetUrl, rows: jobs.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
