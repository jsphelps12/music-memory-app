/**
 * CI gate: refuse to publish an OTA whose native fingerprint differs from the
 * binary users actually have.
 *
 * An OTA ships JS only. If this commit's native fingerprint differs from the
 * live build's, the update can reference native modules that binary does not
 * contain. In this app that is a hard crash, not a degraded feature —
 * modules/now-playing and modules/shazam-kit both call `requireNativeModule` at
 * module top level with no try/catch, so the throw happens at import time.
 * `runtimeVersion` is "appVersion", so EAS will NOT catch this for us.
 *
 * Usage:
 *   node scripts/fingerprint-gate.mjs --profile preview
 *   node scripts/fingerprint-gate.mjs --profile production
 *
 * Exits non-zero on mismatch, on a missing live build, and on a live build with
 * no recorded fingerprint. That last pair used to warn-and-proceed, which is
 * indistinguishable from passing in a green check — unverifiable is not safe.
 */
import { appEnvForProfile, liveBuild, localFingerprint } from "./lib/fingerprint.mjs";

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
const [local, live] = await Promise.all([localFingerprint(appEnv), liveBuild(profile)]);

console.log(`local fingerprint:      ${local}`);

if (!live) {
  fail(
    `No finished iOS build exists for profile "${profile}", so there is nothing to verify this ` +
      `update against. Cut a build before publishing to this channel.`
  );
}

console.log(`live build fingerprint: ${live.fingerprint ?? "<not recorded>"} (build ${live.buildNumber}, v${live.appVersion})`);

if (!live.fingerprint) {
  fail(
    `The latest finished "${profile}" build (build ${live.buildNumber}) has no recorded fingerprint, ` +
      `so this update cannot be verified against it. Cut a new build rather than publishing blind.`
  );
}

if (live.fingerprint !== local) {
  fail(
    `Native fingerprint mismatch for "${profile}". This commit changes native code relative to ` +
      `build ${live.buildNumber}, so an OTA update would likely crash it. Cut a new build instead.\n` +
      `Run \`node scripts/fingerprint-check.mjs\` locally to see both profiles.`
  );
}

console.log(`Fingerprints match — safe to publish a JS-only update to "${profile}".`);
