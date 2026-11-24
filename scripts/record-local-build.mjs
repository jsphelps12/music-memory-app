/**
 * Records a build made on the Mac in scripts/local-builds.json, so the OTA
 * gate (scripts/fingerprint-gate.mjs, scripts/publish-ota.sh) knows an update
 * can reach it. EAS only knows its own builds; without this, every update for
 * a locally built binary needed SKIP_GATE=1 and a hand check.
 *
 *   node scripts/record-local-build.mjs path/to/Soundtracks.ipa
 *   node scripts/record-local-build.mjs path/to/Soundtracks.app   (an .xcarchive's Products/Applications/…)
 *
 * Everything comes from the built app, never typed: the runtime version from
 * EXUpdates.bundle/fingerprint (what the binary asks the update server for),
 * the channel from Expo.plist (production or preview), the build number,
 * version and bundle id from Info.plist. Run it once per build you send to
 * TestFlight; commit the JSON. Re-recording the same build replaces its row.
 * macOS only (unzip, plutil).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/record-local-build.mjs <path to .ipa or .app>");
  process.exit(2);
}

const LIST = new URL("./local-builds.json", import.meta.url);
const CHANNEL_PROFILE = { production: "production", preview: "preview" };

let scratch = null;
try {
  const app = appBundle(resolve(input));
  const fingerprintFile = join(app, "EXUpdates.bundle", "fingerprint");
  if (!existsSync(fingerprintFile)) {
    throw new Error(
      `${basename(app)} has no EXUpdates.bundle/fingerprint. Is this a Release build with expo-updates?`
    );
  }
  const runtimeVersion = readFileSync(fingerprintFile, "utf8").trim();
  if (!/^[0-9a-f]{40}$/.test(runtimeVersion)) throw new Error(`Unexpected fingerprint: "${runtimeVersion}"`);

  const plist = (file, key) =>
    execFileSync("plutil", ["-extract", key, "raw", join(app, file)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  let channel;
  try {
    channel = plist("Expo.plist", "EXUpdatesRequestHeaders.expo-channel-name");
  } catch {
    throw new Error(
      `${basename(app)} has no update channel in Expo.plist, so no OTA can reach it ` +
        `(a simulator or development build?). Record the build you send to TestFlight.`
    );
  }
  const profile = CHANNEL_PROFILE[channel];
  if (!profile) throw new Error(`Unknown update channel "${channel}" in Expo.plist.`);

  const row = {
    profile,
    buildNumber: plist("Info.plist", "CFBundleVersion"),
    appVersion: plist("Info.plist", "CFBundleShortVersionString"),
    runtimeVersion,
    bundleId: plist("Info.plist", "CFBundleIdentifier"),
    recordedAt: new Date().toISOString().slice(0, 10),
  };

  const list = existsSync(LIST) ? JSON.parse(readFileSync(LIST, "utf8")) : [];
  const i = list.findIndex((b) => b.profile === row.profile && String(b.buildNumber) === row.buildNumber);
  // Keep a hand-written note on a re-record.
  if (i >= 0) list[i] = { ...row, ...(list[i].note ? { note: list[i].note } : {}) };
  else list.push(row);
  list.sort((a, b) => a.profile.localeCompare(b.profile) || Number(b.buildNumber) - Number(a.buildNumber));
  writeFileSync(LIST, JSON.stringify(list, null, 2) + "\n");

  console.log(`${i >= 0 ? "Updated" : "Recorded"} ${row.profile} build ${row.buildNumber} (v${row.appVersion})`);
  console.log(`  runtimeVersion ${row.runtimeVersion}`);
  console.log(`Commit scripts/local-builds.json so the gate knows it everywhere.`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}

/** The .app inside an .ipa (unzipped to a temp folder), or the .app itself. */
function appBundle(path) {
  if (!existsSync(path)) throw new Error(`No such file: ${path}`);
  if (path.endsWith(".app")) return path;
  if (!path.endsWith(".ipa")) throw new Error("Expected an .ipa or an .app.");
  scratch = mkdtempSync(join(tmpdir(), "record-local-build-"));
  execFileSync("unzip", ["-q", path, "Payload/*", "-d", scratch]);
  const payload = join(scratch, "Payload");
  const app = readdirSync(payload).find((f) => f.endsWith(".app"));
  if (!app) throw new Error("No .app inside the .ipa's Payload/.");
  return join(payload, app);
}
