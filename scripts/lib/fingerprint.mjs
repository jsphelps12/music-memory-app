/**
 * Shared fingerprint plumbing for scripts/fingerprint-check.mjs (informational)
 * and scripts/fingerprint-gate.mjs (CI gate).
 *
 * A "fingerprint" is a hash of everything that affects the native build —
 * app.config.ts and its plugins, autolinked native modules, patches/, the
 * package.json `scripts` block, the native project dir. It is the only value
 * that actually tracks native code. `runtimeVersion: { policy: "appVersion" }`
 * does not: it is the literal `version` string, so it stays put across native
 * changes and EAS cannot tell two binaries apart.
 *
 * Production and preview fingerprints always differ from each other even on an
 * identical commit, because app.config.ts swaps bundle identifier, app group,
 * scheme, name and icon on EXPO_PUBLIC_APP_ENV. Only compare a profile with
 * itself.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_BUFFER = 32 * 1024 * 1024;

/** `appEnv` is what app.config.ts branches on; `profile` is the eas.json key. */
export const TARGETS = [
  { profile: "production", appEnv: "production", label: "App Store" },
  { profile: "preview", appEnv: "preview", label: "Beta" },
];

export function appEnvForProfile(profile) {
  const target = TARGETS.find((t) => t.profile === profile);
  if (!target) {
    throw new Error(`Unknown profile "${profile}". Expected one of: ${TARGETS.map((t) => t.profile).join(", ")}`);
  }
  return target.appEnv;
}

export async function localFingerprint(appEnv) {
  const { stdout } = await run(
    "npx",
    ["expo-updates", "fingerprint:generate", "--platform", "ios"],
    // The shell env wins over .env here, which is what lets us compute the
    // production fingerprint from a working tree whose .env says preview.
    { env: { ...process.env, EXPO_PUBLIC_APP_ENV: appEnv }, maxBuffer: MAX_BUFFER }
  );
  return JSON.parse(stdout).hash;
}

/**
 * Recent finished iOS builds for the profile, newest first.
 *
 * Plural on purpose. Under `policy: "fingerprint"` the question is whether ANY
 * installed binary would receive an update, and the newest build is not
 * necessarily the matching one — cutting a build, reverting a native change,
 * and republishing leaves the match on an older build.
 */
export async function liveBuilds(profile, limit = 10) {
  const { stdout } = await run(
    "npx",
    [
      "eas-cli", "build:list",
      "--platform", "ios",
      "--profile", profile,
      "--status", "finished",
      "--limit", String(limit),
      "--json", "--non-interactive",
    ],
    { maxBuffer: MAX_BUFFER }
  );
  return JSON.parse(stdout).map((build) => ({
    buildNumber: build.appBuildVersion,
    appVersion: build.appVersion,
    // What the installed binary actually asks the update server for. Builds cut
    // under the old "appVersion" policy carry a version string like "1.1.0" and
    // can never match a fingerprint-derived update — that is the strand.
    runtimeVersion: build.runtimeVersion,
    completedAt: build.completedAt,
    fingerprint: build.fingerprint?.hash ?? null,
  }));
}

/** Newest finished build, or null. */
export async function liveBuild(profile) {
  const builds = await liveBuilds(profile, 1);
  return builds[0] ?? null;
}
