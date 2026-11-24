/**
 * CI gate: refuse to publish an OTA that no installed binary would receive.
 *
 * `runtimeVersion.policy` is "fingerprint", so the label an update is published
 * under is derived from everything affecting the native build, and a binary
 * only receives updates whose label matches the one compiled into it. That
 * makes the crash-on-launch case impossible — EAS can no longer serve JS to a
 * binary lacking the native modules it references.
 *
 * What it does NOT prevent is publishing into the void. A mismatched update is
 * accepted, reported as a successful publish, and delivered to nobody. That
 * failure is silent and looks exactly like success, so it needs a gate of its
 * own: does a finished build for this profile actually carry this runtime
 * version?
 *
 * `--skip-if-unserved` (preview only): when no build serves this runtime
 * version, exit 0 with a warning and `publish=false` instead of failing. The
 * beta channel is kept but often has no binary for the current native
 * fingerprint, and a red job on every merge hid real failures. The workflow
 * skips the publish on `publish=false`. Errors (eas-cli, fingerprint
 * generation, a missing runtime version) still exit non-zero.
 *
 * Writes `publish=true|false` to $GITHUB_OUTPUT whenever it exits 0.
 *
 * Builds made on the Mac count too (scripts/local-builds.json, recorded by
 * scripts/record-local-build.mjs), so an update for a locally built binary
 * passes without SKIP_GATE.
 *
 * Usage:
 *   node scripts/fingerprint-gate.mjs --profile preview --skip-if-unserved
 *   node scripts/fingerprint-gate.mjs --profile production
 */
import { appendFileSync } from "node:fs";
import { appEnvForProfile, gateDecision, knownBuilds, localFingerprint } from "./lib/fingerprint.mjs";

const profileArg = process.argv.indexOf("--profile");
if (profileArg === -1 || !process.argv[profileArg + 1]) {
  console.error("Usage: node scripts/fingerprint-gate.mjs --profile <preview|production> [--skip-if-unserved]");
  process.exit(2);
}
const profile = process.argv[profileArg + 1];
const skipIfUnserved = process.argv.includes("--skip-if-unserved");

/** GitHub Actions renders these as annotations; harmless locally. */
const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

/** Appends a line to a GitHub Actions file ($GITHUB_OUTPUT etc.); no-op locally. */
const appendGithubFile = (envName, text) => {
  const file = process.env[envName];
  if (file) appendFileSync(file, `${text}\n`);
};

const appEnv = appEnvForProfile(profile);
const [runtimeVersion, builds] = await Promise.all([
  localFingerprint(appEnv),
  knownBuilds(profile),
]);

console.log(`update runtimeVersion: ${runtimeVersion}`);

if (builds.length > 0) {
  console.log(`finished "${profile}" builds:`);
  for (const b of builds) {
    const marker = b.runtimeVersion === runtimeVersion ? "  <- match" : "";
    const where = b.source === "local" ? "  (built on the Mac)" : "";
    console.log(`  build ${b.buildNumber} (v${b.appVersion})  runtimeVersion ${b.runtimeVersion}${where}${marker}`);
  }
}

const decision = gateDecision({ runtimeVersion, builds, skipIfUnserved });

if (decision.action === "publish") {
  console.log(`Build ${decision.match.buildNumber} serves this runtime version — safe to publish.`);
  appendGithubFile("GITHUB_OUTPUT", "publish=true");
  process.exit(0);
}

if (decision.action === "skip") {
  const msg =
    `No ${profile} build matches fingerprint ${runtimeVersion}; ${profile} OTA skipped. ` +
    `Cut a ${profile} build to resume ${profile === "preview" ? "beta " : ""}updates.`;
  console.log(`::warning::${msg}`);
  appendGithubFile("GITHUB_STEP_SUMMARY", `> [!WARNING]\n> ${msg}`);
  appendGithubFile("GITHUB_OUTPUT", "publish=false");
  process.exit(0);
}

if (decision.reason === "no-runtime") {
  fail(`Could not compute this commit's runtime version (got ${JSON.stringify(runtimeVersion)}).`);
}

if (decision.reason === "no-builds") {
  fail(
    `No finished iOS build exists for profile "${profile}". Publishing would reach nobody. ` +
      `Cut a build first (a Mac build counts once recorded with scripts/record-local-build.mjs).`
  );
}

const newest = builds[0];
fail(
  `No installed binary would receive this update.\n` +
    `This commit's runtime version is ${runtimeVersion}; the newest "${profile}" build ` +
    `(build ${newest.buildNumber}) serves ${newest.runtimeVersion}.\n` +
    `Publishing anyway would succeed and reach zero users. Cut a new "${profile}" build ` +
    `from this commit, then re-run. (Built it on the Mac? Record it first: ` +
    `node scripts/record-local-build.mjs <path to the .ipa or .app>.)`
);
