/**
 * Report, per profile, whether this working tree can ship an OTA — and if not,
 * why. Informational; the enforcing version is scripts/fingerprint-gate.mjs,
 * which CI runs.
 *
 * `runtimeVersion.policy` is "fingerprint": the label an update is published
 * under is derived from everything affecting the native build (app.config.ts
 * and its plugins, autolinked native modules, patches/, eas.json, the
 * package.json `scripts` block, the native project dir). A binary receives an
 * update only when that label exactly matches the one compiled into it.
 *
 * So an update either reaches binaries built from equivalent native code, or it
 * reaches nobody at all. It can no longer reach a binary that would crash on it
 * — but "reaches nobody" is silent and looks identical to a successful publish,
 * which is what this exists to make visible.
 *
 * Production and preview labels always differ from each other even on an
 * identical commit, because app.config.ts swaps bundle identifier, app group,
 * scheme, name and icon on EXPO_PUBLIC_APP_ENV. Only compare a profile with
 * itself.
 *
 * Usage:
 *   node scripts/fingerprint-check.mjs
 *
 * Requires an authenticated eas-cli (`npx eas-cli whoami`).
 *
 * DELIBERATELY NOT an npm script. package.json's entire `scripts` block feeds
 * the fingerprint — Expo cannot tell a benign script from `postinstall:
 * patch-package`, which really does change native output, so it hashes all of
 * it. Adding one line there moved the preview label with no native change
 * whatsoever, which would strand every installed binary. A tool for observing
 * this must not cause it. (Files under scripts/ are fine — only the
 * package.json block is hashed.)
 */
import { TARGETS, liveBuilds, localFingerprint } from "./lib/fingerprint.mjs";

async function checkTarget({ profile, appEnv, label }) {
  const [runtimeVersion, builds] = await Promise.all([
    localFingerprint(appEnv),
    liveBuilds(profile).catch(() => []),
  ]);

  console.log(`\n${label} — profile "${profile}"`);
  console.log(`  this tree publishes as  ${runtimeVersion}`);

  if (builds.length === 0) {
    console.log("  no finished builds found (or eas-cli is not authenticated)");
    return "unreachable";
  }

  for (const b of builds.slice(0, 3)) {
    const when = b.completedAt ? b.completedAt.slice(0, 10) : "unknown date";
    const marker = b.runtimeVersion === runtimeVersion ? "  <- would receive it" : "";
    console.log(
      `  build ${String(b.buildNumber).padEnd(3)} serves       ${b.runtimeVersion}  (${when})${marker}`
    );
  }

  if (builds.some((b) => b.runtimeVersion === runtimeVersion)) {
    console.log("  → OK. An OTA from this tree reaches that build.");
    return "reachable";
  }

  console.log("  → UNREACHABLE. Publishing would succeed and reach zero users.");
  console.log("    Cut a new build from this commit for this profile.");
  return "unreachable";
}

const results = [];
for (const target of TARGETS) {
  results.push(await checkTarget(target));
}

const unreachable = results.filter((r) => r === "unreachable").length;

console.log("");
if (unreachable === 0) {
  console.log("Both profiles are reachable from this tree.");
} else {
  console.log(
    `${unreachable} profile(s) unreachable. Native code has moved since those binaries were ` +
      "cut, so they need a new build before an OTA can reach them."
  );
}
