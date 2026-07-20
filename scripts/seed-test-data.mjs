/**
 * Seeds N realistic-looking stringing jobs for local UI/volume testing.
 *
 * SAFETY: only ever run this against an isolated Neon branch, never
 * production — it inserts real rows via plain SQL, bypassing the app's API
 * entirely. Requires --force (prints the target DB host either way, so you
 * can abort if it's not what you expect).
 *
 *   node scripts/seed-test-data.mjs --force [count]   (default count: 500)
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local isn't auto-loaded outside Next.js — parse it ourselves.
function loadDotEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadDotEnvLocal();

const FORCE = process.argv.includes("--force");
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a))) || 500;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set (checked process.env and .env.local).");
  process.exit(1);
}
const host = new URL(DATABASE_URL).hostname;

console.log(`Target database host: ${host}`);
console.log(`Will insert ${COUNT} test jobs.`);
if (!FORCE) {
  console.log("\nDry run — nothing written. Re-run with --force to actually insert.");
  console.log("Double-check the host above is your TEST BRANCH, not production, before doing so.");
  process.exit(0);
}

const sql = neon(DATABASE_URL);

// --- Reference data (mirrors lib/options.ts / lib/types.ts) ---------------

const RACKET_TYPES_BY_BRAND = {
  Yonex: ["Astrox", "Nanoflare", "Arcsaber", "Duora", "Voltric", "Nanoray", "Muscle Power", "Carbonex"],
  Victor: ["Thruster", "Auraspeed", "Jetspeed", "DriveX", "Brave Sword", "Hypernano X", "Meteor X"],
  "Li-Ning": ["Axforce", "Bladex", "Halbertec", "Tectonic", "Aeronaut", "Windstorm", "Turbo Charging"],
  Apacs: ["Feather Weight", "Lethal", "Z-Ziggler", "Virtuoso", "Nano Fusion"],
  Mizuno: ["Fortius", "Altius", "Acrospeed", "Caliber"],
  Felet: ["TJ Power", "The Legend", "Woven"],
};
const BRANDS = Object.keys(RACKET_TYPES_BY_BRAND);
const CUSTOM_BRANDS = ["Ashaway", "Carlton", "Babolat"];
const COLORS = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Orange", "Purple"];
const STRING_TYPES = [
  "Yonex BG65", "Yonex BG65 Ti", "Yonex BG66 Ultimax", "Yonex BG80", "Yonex BG80 Power",
  "Yonex Exbolt 63", "Yonex Exbolt 65", "Yonex Aerobite", "Yonex Nanogy 98",
  "Victor VBS-63", "Victor VBS-66N", "Victor VBS-70", "Li-Ning No.1",
];
const CUSTOM_STRINGS = ["Ashaway Zymax 62", "Babolat String X"];
const TENSION_RANGE = { Kg: { min: 8, max: 16 }, Lbs: { min: 17, max: 36 } };
const USERS = ["ollie.bondan@gmail.com", "aisha.bondan@gmail.com", "esti.bondan@gmail.com"];
const TASYA = "alyssatasya@gmail.com";
const NOTES_POOL = [
  "Handle grip is worn, mentioned to customer",
  "Frame has a small scratch near the throat",
  "Customer wants extra tension check before stringing",
  "Rush order — needed by Friday",
  "Bring own string spool next visit",
  "Grommet at 3 o'clock looks cracked",
  "Repeat customer, prefers slightly lower tension",
  "Racket dropped off with a broken zipper on the bag",
];
const FIRST_NAMES = [
  "Budi", "Sari", "Denis", "Fadli", "Hafidz", "Thubten", "Harish", "Made", "Wayan", "Nyoman",
  "Putu", "Rina", "Dewi", "Agus", "Bayu", "Citra", "Dian", "Eka", "Fitri", "Gita",
  "Hendra", "Indra", "Joko", "Kartika", "Lina", "Maya", "Nita", "Oscar", "Putra", "Ratna",
];
const LAST_NAMES = ["K", "Santoso", "Wijaya", "Pratama", "Kusuma", "Halim", "Setiawan", "Gunawan", ""];

// --- Helpers ---------------------------------------------------------------

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hoursLater(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}
function daysAgo(days) {
  const d = new Date(Date.now() - days * 86_400_000);
  d.setHours(randInt(9, 18), randInt(0, 59), 0, 0);
  return d.toISOString();
}
function customerName() {
  const first = rand(FIRST_NAMES);
  const last = rand(LAST_NAMES);
  return last ? `${first} ${last}` : first;
}

// STEPS in workflow order — mirrors lib/types.ts
const STEPS = [
  { key: "received", column: "step1_received", status: "RECEIVED" },
  { key: "toTiton", column: "step2_to_titon", status: "WITH_TITON" },
  { key: "fromTiton", column: "step3_from_titon", status: "STRUNG" },
  { key: "returned", column: "step4_returned", status: "RETURNED" },
  { key: "paid", column: "step5_paid", status: "PAID" },
  { key: "forwarded", column: "step6_forwarded", status: "FORWARDED" },
  { key: "tasyaReceived", column: "step7_tasya_received", status: "DONE" },
];

const CSV_HEADER = [
  "id", "created_at", "created_by", "customer_name", "racket_brand", "racket_type",
  "racket_color", "string_type", "string_color", "tension_value", "tension_unit", "status",
  ...STEPS.flatMap((s) => [`${s.column}_at`, `${s.column}_by`]),
  "notes", "updated_at", "updated_by",
];

// --- Status distribution: 500 jobs, weighted toward DONE like a real shop --

const WEIGHTS = { RECEIVED: 8, WITH_TITON: 7, STRUNG: 6, RETURNED: 5, PAID: 5, FORWARDED: 4, DONE: 65 };
const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
const statusPlan = [];
for (const [status, weight] of Object.entries(WEIGHTS)) {
  const n = Math.round((weight / totalWeight) * COUNT);
  for (let i = 0; i < n; i++) statusPlan.push(status);
}
while (statusPlan.length < COUNT) statusPlan.push("DONE");
while (statusPlan.length > COUNT) statusPlan.pop();
shuffle(statusPlan);

function buildJob(targetStatus, isOldDone) {
  const stepCount = STEPS.findIndex((s) => s.status === targetStatus) + 1;
  const brand = Math.random() < 0.05 ? rand(CUSTOM_BRANDS) : rand(BRANDS);
  const typesForBrand = RACKET_TYPES_BY_BRAND[brand];
  const racketType = !typesForBrand
    ? rand(["Custom Series", "Special Order", ""])
    : Math.random() < 0.1
      ? ""
      : Math.random() < 0.05
        ? "Custom Order"
        : rand(typesForBrand);
  const stringType = Math.random() < 0.05 ? rand(CUSTOM_STRINGS) : rand(STRING_TYPES);
  const tensionUnit = Math.random() < 0.5 ? "Kg" : "Lbs";
  const range = TENSION_RANGE[tensionUnit];
  const tensionValue = String(randInt(range.min * 2, range.max * 2) / 2); // .5 steps

  // Old DONE jobs finished 35-400 days ago (archive-eligible); recent ones
  // within the last 25 days (not yet eligible); everything else in between.
  const receivedAt =
    targetStatus === "DONE"
      ? isOldDone
        ? daysAgo(randInt(40, 400))
        : daysAgo(randInt(5, 24))
      : daysAgo(randInt(0, 30));

  const steps = {};
  let cursor = receivedAt;
  for (let i = 0; i < stepCount; i++) {
    const step = STEPS[i];
    if (i > 0) cursor = hoursLater(cursor, randInt(2, 72));
    steps[step.key] = {
      at: cursor,
      by: step.key === "tasyaReceived" ? TASYA : rand(USERS),
    };
  }
  const last = steps[STEPS[stepCount - 1].key];

  const row = {
    id: crypto.randomUUID(),
    created_at: receivedAt,
    created_by: steps.received.by,
    customer_name: customerName(),
    racket_brand: brand,
    racket_type: racketType,
    racket_color: rand(COLORS),
    string_type: stringType,
    string_color: rand(COLORS),
    tension_value: tensionValue,
    tension_unit: tensionUnit,
    status: targetStatus,
    notes: Math.random() < 0.2 ? rand(NOTES_POOL) : "",
    updated_at: last.at,
    updated_by: last.by,
  };
  for (const step of STEPS) {
    row[`${step.column}_at`] = steps[step.key]?.at ?? null;
    row[`${step.column}_by`] = steps[step.key]?.by ?? null;
  }
  return CSV_HEADER.map((c) => row[c] ?? null);
}

// --- Run ---------------------------------------------------------------

async function main() {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id text PRIMARY KEY, created_at text NOT NULL, created_by text NOT NULL,
      customer_name text NOT NULL, racket_brand text NOT NULL DEFAULT '',
      racket_type text NOT NULL DEFAULT '', racket_color text NOT NULL DEFAULT '',
      string_type text NOT NULL DEFAULT '', string_color text NOT NULL DEFAULT '',
      tension_value text NOT NULL DEFAULT '', tension_unit text NOT NULL, status text NOT NULL,
      ${STEPS.map((s) => `${s.column}_at text, ${s.column}_by text`).join(", ")},
      notes text NOT NULL DEFAULT '', updated_at text NOT NULL, updated_by text NOT NULL,
      archived_at text, archived_by text
    )
  `);

  const columnList = CSV_HEADER.join(", ");
  const placeholders = CSV_HEADER.map((_, i) => `$${i + 1}`).join(", ");
  let oldDoneBudget = Math.round(WEIGHTS.DONE / totalWeight * COUNT * 0.6);

  let inserted = 0;
  for (const targetStatus of statusPlan) {
    const isOldDone = targetStatus === "DONE" && oldDoneBudget-- > 0;
    const row = buildJob(targetStatus, isOldDone);
    await sql.query(`INSERT INTO jobs (${columnList}) VALUES (${placeholders})`, row);
    inserted++;
    if (inserted % 50 === 0) console.log(`  ${inserted}/${COUNT}...`);
  }
  console.log(`\nDone — inserted ${inserted} test jobs into ${host}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
