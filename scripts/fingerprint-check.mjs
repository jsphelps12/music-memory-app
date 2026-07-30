/**
 * Compare this working tree's native fingerprint against the live EAS builds,
 * per profile. Informational — the enforcing version is
 * scripts/fingerprint-gate.mjs, which CI runs.
 *
 * WHY THIS EXISTS
 * ---------------
 * An OTA update ships JS only. Whether that JS is safe for a given binary
 * depends on whether the native code matches — and with
 * `runtimeVersion: { policy: "appVersion" }` the runtime version is just the
 * `version` string in app.config.ts, so it does NOT move when native code
 * changes. EAS therefore cannot tell two binaries apart and will happily serve
 * a bundle to one that lacks the native modules it references.
 *
 * The fingerprint is the thing that actually tracks native code. This prints it
 * next to the live builds' so drift is visible BEFORE you dispatch a promote,
 * rather than as a crash report afterwards.
 *
 * Usage:
 *   node scripts/fingerprint-check.mjs
 *
 * Requires an authenticated eas-cli (`npx eas-cli whoami`).
 *
 * DELIBERATELY NOT an npm script. package.json's entire `scripts` block feeds
 * the fingerprint — Expo cannot tell a benign script from `postinstall:
 * patch-package`, which really does change native output, so it hashes all of
 * it. Adding one line there moved the preview fingerprint from 084fc315 to
 * a44b261e with no native change whatsoever, which would have stranded beta
 * build 20 behind a gate failure. A tool for observing fingerprint drift must
 * not cause it.
 *
 * The same trap applies to anything that edits `scripts`. Under
 * `policy: "fingerprint"` it is worse: adding a script strands every installed
 * binary until a new build ships. (Files under scripts/ are fine — only the
 * package.json block is hashed.)
 */
import { TARGETS, liveBuild, localFingerprint } from "./lib/fingerprint.mjs";

async function checkTarget({ profile, appEnv, label }) {
  const [local, live] = await Promise.all([
    localFingerprint(appEnv),
    liveBuild(profile).catch(() => null),
  ]);

  console.log(`\n${label} — profile "${profile}"`);
  console.log(`  local (this tree)  ${local}`);

  if (!live) {
    console.log("  live build         none found (or eas-cli is not authenticated)");
    return "unknown";
  }

  const when = live.completedAt ? live.completedAt.slice(0, 10) : "unknown date";
  console.log(
    `  live build         ${live.fingerprint ?? "not recorded"}` +
      `  (build ${live.buildNumber}, v${live.appVersion}, ${when})`
  );
  console.log(`  runtimeVersion     ${live.runtimeVersion}`);

  if (!live.fingerprint) {
    console.log("  → UNKNOWN. This build predates fingerprint recording; cannot verify.");
    return "unknown";
  }
  if (live.fingerprint === local) {
    console.log("  → MATCH. A JS-only OTA is safe for this binary.");
    return "match";
  }
  console.log("  → MISMATCH. This tree's native code differs from that binary.");
  console.log("    An OTA would reference native modules it does not contain. Cut a new build.");
  return "mismatch";
}

const results = [];
for (const target of TARGETS) {
  results.push(await checkTarget(target));
}

const mismatches = results.filter((r) => r === "mismatch").length;
const unknowns = results.filter((r) => r === "unknown").length;

console.log("");
if (mismatches === 0 && unknowns === 0) {
  console.log("All profiles match their live build.");
} else {
  console.log(
    `${mismatches} mismatch(es), ${unknowns} unverifiable. ` +
      "A mismatched profile needs a new binary before its channel can receive an OTA."
  );
}
