import { Job, JobStatus } from "./types";

/** https://wa.me/?text=... opens WhatsApp (app on mobile, web fallback on desktop) with the text pre-filled. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * One job's summary + a link to it, for the share icon on the job detail
 * page and each list card. statusLabels is passed in (rather than imported
 * from components/StatusBadge) to keep lib/ free of a dependency on
 * components/.
 */
export function jobShareText(
  job: Job,
  origin: string,
  statusLabels: Record<JobStatus, string>
): string {
  const lines = [
    `🏸 ${job.shortId ? `${job.shortId} — ` : ""}${job.customerName}`,
    `Status: ${statusLabels[job.status]}`,
  ];
  const racket = [job.racketBrand, job.racketType].filter(Boolean).join(" ");
  if (racket) lines.push(`Racket: ${racket}`);
  if (job.ownString) {
    lines.push("String: customer's own");
  } else if (job.stringType) {
    lines.push(`String: ${job.stringType}`);
  }
  if (job.tensionValue) lines.push(`Tension: ${job.tensionValue} ${job.tensionUnit}`);
  lines.push("", `${origin}/jobs/${job.id}`);
  return lines.join("\n");
}

/**
 * A digest of many jobs (the whole list or whatever's currently filtered) —
 * one line per job, capped so the message stays reasonable before some
 * WhatsApp clients start truncating long pre-filled text.
 */
export function jobListShareText(
  jobs: Job[],
  origin: string,
  listUrl: string,
  label: string,
  statusLabels: Record<JobStatus, string>
): string {
  const MAX_LINES = 40;
  const lines = jobs
    .slice(0, MAX_LINES)
    .map((j) => `• ${j.shortId ? `${j.shortId} ` : ""}${j.customerName} — ${statusLabels[j.status]}`);
  return [
    `🏸 ${label} (${jobs.length})`,
    "",
    ...lines,
    jobs.length > MAX_LINES ? `…and ${jobs.length - MAX_LINES} more` : "",
    "",
    `${origin}${listUrl}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
