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
 * Builds made on the Mac count too (scripts/local-builds.json, recorded by
 * scripts/record-local-build.mjs), so an update for a locally built binary
 * passes without SKIP_GATE.
 *
 * Usage:
 *   node scripts/fingerprint-gate.mjs --profile preview
 *   node scripts/fingerprint-gate.mjs --profile production
 */
import { appEnvForProfile, knownBuilds, localFingerprint } from "./lib/fingerprint.mjs";

const profileArg = process.argv.indexOf("--profile");
if (profileArg === -1 || !process.argv[profileArg + 1]) {
  console.error("Usage: node scripts/fingerprint-gate.mjs --profile <preview|production>");
  process.exit(2);
}
const profile = process.argv[profileArg + 1];

/** GitHub Actions renders these as annotations; harmless locally. */
const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

const appEnv = appEnvForProfile(profile);
const [runtimeVersion, builds] = await Promise.all([
  localFingerprint(appEnv),
  knownBuilds(profile),
]);

console.log(`update runtimeVersion: ${runtimeVersion}`);

if (builds.length === 0) {
  fail(
    `No finished iOS build exists for profile "${profile}". Publishing would reach nobody. ` +
      `Cut a build first (a Mac build counts once recorded with scripts/record-local-build.mjs).`
  );
}

console.log(`finished "${profile}" builds:`);
for (const b of builds) {
  const marker = b.runtimeVersion === runtimeVersion ? "  <- match" : "";
  const where = b.source === "local" ? "  (built on the Mac)" : "";
  console.log(`  build ${b.buildNumber} (v${b.appVersion})  runtimeVersion ${b.runtimeVersion}${where}${marker}`);
}

const match = builds.find((b) => b.runtimeVersion === runtimeVersion);

if (!match) {
  const newest = builds[0];
  fail(
    `No installed binary would receive this update.\n` +
      `This commit's runtime version is ${runtimeVersion}; the newest "${profile}" build ` +
      `(build ${newest.buildNumber}) serves ${newest.runtimeVersion}.\n` +
      `Publishing anyway would succeed and reach zero users. Cut a new "${profile}" build ` +
      `from this commit, then re-run. (Built it on the Mac? Record it first: ` +
      `node scripts/record-local-build.mjs <path to the .ipa or .app>.)`
  );
}

console.log(`Build ${match.buildNumber} serves this runtime version — safe to publish.`);
