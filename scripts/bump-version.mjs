/**
 * Semver bump driven by the commit history since the last release tag.
 *
 *   npm run bump            auto-detect major/minor/patch from commit subjects
 *   npm run bump minor      force a specific bump
 *
 * Rules (checked against every commit subject since the last v* tag):
 *   - contains "breaking" or "major:"          → major
 *   - starts with add/feat/implement/new       → minor
 *   - anything else (fixes, tweaks, docs)      → patch
 *
 * The script only rewrites package.json. Afterwards: commit it together with
 * your changes, then tag the commit:  git tag v<version> && git push --tags
 * (the tag is what the next run measures against).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

const pkgPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

let range = "HEAD";
try {
  const lastTag = run("git describe --tags --abbrev=0 --match v*");
  range = `${lastTag}..HEAD`;
} catch {
  // no release tag yet — analyze the whole history
}

const subjects = run(`git log ${range} --pretty=%s`).split("\n").filter(Boolean);
if (subjects.length === 0) {
  console.log(`No commits since the last release tag — staying at v${pkg.version}`);
  process.exit(0);
}

const forced = process.argv[2];
let bump;
if (forced) {
  if (!["major", "minor", "patch"].includes(forced)) {
    console.error(`Unknown bump type "${forced}" — use major, minor or patch`);
    process.exit(1);
  }
  bump = forced;
} else if (subjects.some((s) => /breaking|major:/i.test(s))) {
  bump = "major";
} else if (subjects.some((s) => /^(add|feat|implement|new )/i.test(s))) {
  bump = "minor";
} else {
  bump = "patch";
}

// Tolerates an optional prerelease suffix (e.g. "0.1.1-beta") on the current
// version, but a bump always produces a clean major.minor.patch — it doesn't
// re-append the suffix, since a bump means moving forward past that baseline.
const versionMatch = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)/);
if (!versionMatch) {
  console.error(`package.json version "${pkg.version}" is not parseable semver`);
  process.exit(1);
}
let [major, minor, patch] = versionMatch.slice(1).map(Number);
if (bump === "major") [major, minor, patch] = [major + 1, 0, 0];
else if (bump === "minor") [minor, patch] = [minor + 1, 0];
else patch += 1;

pkg.version = `${major}.${minor}.${patch}`;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`${bump} bump → v${pkg.version}  (${subjects.length} commit(s) since ${range === "HEAD" ? "start" : range.split("..")[0]})`);
console.log(`Now commit, then:  git tag v${pkg.version} && git push origin main --tags`);
