/**
 * Reset the E2E account on STAGING to a known-empty state.
 *
 * The smoke flow signs in, creates a moment, and asserts it survives a
 * relaunch. That only means something if the account starts empty every run —
 * otherwise a stale moment from a previous run satisfies the assertion and the
 * test passes while the feature is broken.
 *
 * Deletes the account's moments and their storage objects, then makes sure the
 * auth user and profile row exist with the configured password. Never touches
 * any other user.
 *
 * It does NOT create moments — creating one through the UI is what the Maestro
 * flow tests. This only guarantees the account starts empty.
 *
 * E2E_SUPABASE_SERVICE_ROLE_KEY needs service-role privileges: either a legacy
 * `service_role` JWT (eyJhbGci...) or a new-style `sb_secret_...` key. The
 * publishable/anon key will not work — admin calls require the elevated key.
 *
 * Usage:
 *   E2E_SUPABASE_URL=... E2E_SUPABASE_SERVICE_ROLE_KEY=... \
 *   E2E_PASSWORD=... node scripts/seed-e2e.mjs
 *
 * SAFETY: refuses to run against the production project. The service-role key
 * bypasses RLS entirely, so a misconfigured URL would delete real users' data.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

/**
 * Load .env.e2e.local if present, so local runs don't need the values typed on
 * the command line every time. Hand-parsed rather than pulling in dotenv: a new
 * dependency would move the native fingerprint and strand every installed
 * binary. Already-set environment variables win, so CI (which supplies these as
 * secrets, with no file on disk) is unaffected.
 */
function loadLocalEnvFile(path = ".env.e2e.local") {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

loadLocalEnvFile();

const PRODUCTION_REF = "izfhbtipzuvinyacttin";
const E2E_EMAIL = "e2e@soundtracks.test";
const PHOTO_BUCKET = "moment-photos";

const url = process.env.E2E_SUPABASE_URL;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.E2E_PASSWORD;

if (!url || !serviceKey || !password) {
  console.error(
    "Missing config. Required: E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY, E2E_PASSWORD"
  );
  process.exit(1);
}

// Without this the placeholder sails through to the API and comes back as an
// opaque "listUsers failed: Invalid API key" from three frames deep.
const placeholder = [url, serviceKey, password].find((v) => v.startsWith("PASTE_"));
if (placeholder) {
  console.error(
    "Config still contains a placeholder value.\n" +
      "Fill in .env.e2e.local — the service_role key comes from\n" +
      "https://supabase.com/dashboard/project/bqyrpahvdukllasafdpv/settings/api"
  );
  process.exit(1);
}

if (url.includes(PRODUCTION_REF)) {
  console.error(
    `Refusing to run: E2E_SUPABASE_URL points at the production project (${PRODUCTION_REF}).\n` +
      "This script deletes data with a service-role key, which bypasses RLS."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Find the E2E user, creating it on first run. */
async function ensureUser() {
  // listUsers is paginated; the E2E project is small enough for one page, but
  // filter explicitly rather than assuming position.
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);

  const existing = data.users.find((u) => u.email === E2E_EMAIL);
  if (existing) {
    // Re-assert the password every run. Otherwise changing E2E_PASSWORD after
    // the account exists leaves the old one in place, and the flow fails at
    // sign-in with no hint that the config and the account have diverged.
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
    });
    if (updateError) throw new Error(`updateUser failed: ${updateError.message}`);
    return existing;
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: E2E_EMAIL,
    password,
    email_confirm: true,
  });
  if (createError) throw new Error(`createUser failed: ${createError.message}`);
  console.log(`created ${E2E_EMAIL}`);
  return created.user;
}

/**
 * Delete the user's photo objects before their rows — once the rows are gone
 * the paths are unrecoverable, and the bucket is public with guessable URLs.
 *
 * Mirrors `deleteMomentPhotos` in lib/storage.ts: full-size paths and their
 * thumbnails are separate columns and both must go, deduped.
 */
async function deletePhotos(moments) {
  const paths = [
    ...new Set(moments.flatMap((m) => [...(m.photo_urls ?? []), ...(m.photo_thumbnails ?? [])])),
  ].filter(Boolean);
  if (paths.length === 0) return 0;

  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) throw new Error(`storage remove failed: ${error.message}`);
  return paths.length;
}

async function reset(userId) {
  const { data: moments, error } = await supabase
    .from("moments")
    .select("id, photo_urls, photo_thumbnails")
    .eq("user_id", userId);
  if (error) throw new Error(`select moments failed: ${error.message}`);

  const photoCount = await deletePhotos(moments ?? []);

  const { error: deleteError } = await supabase.from("moments").delete().eq("user_id", userId);
  if (deleteError) throw new Error(`delete moments failed: ${deleteError.message}`);

  // The profile row is created by a trigger on signup, but an account created
  // before that trigger existed would have none — and the app assumes one.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: "E2E" }, { onConflict: "id" });
  if (profileError) throw new Error(`upsert profile failed: ${profileError.message}`);

  return { moments: moments?.length ?? 0, photos: photoCount };
}

const user = await ensureUser();
const { moments, photos } = await reset(user.id);

console.log(`reset ${E2E_EMAIL} (${user.id})`);
console.log(`  deleted ${moments} moment(s), ${photos} photo object(s)`);
console.log("  profile row present");
