/**
 * Reset the E2E account on PRODUCTION to a known-empty state, as itself.
 *
 * The production twin of seed-e2e.mjs (which runs on staging with a
 * service-role key and refuses production). Staging is paused on the free
 * plan, so the smoke flow now runs against production (2026-11-15). This
 * script never holds an elevated key: it signs in as the E2E account with
 * E2E_PASSWORD and the public anon key, so RLS limits every delete to that
 * account's own rows and its own storage folder. It cannot touch another
 * user's data even if it is wrong.
 *
 * On first run (no such account) it signs up. Email confirmation is off on
 * this project, so the account is usable immediately.
 *
 * What it guarantees for the smoke flow:
 *   - the account exists and E2E_PASSWORD signs it in;
 *   - it has no moments (and their photo objects are deleted first);
 *   - its profile has onboarding_completed = true, so the app routes to the
 *     timeline rather than onboarding.
 *
 * Usage (CI pulls the URL and anon key from the EAS production environment):
 *   npx eas-cli env:exec production "node scripts/reset-e2e-prod.mjs"
 * with E2E_PASSWORD in the environment.
 */
import { createClient } from "@supabase/supabase-js";

const E2E_EMAIL = "e2e@soundtracks.test";
const PHOTO_BUCKET = "moment-photos";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.E2E_PASSWORD;

if (!url || !anonKey || !password) {
  console.error(
    "Missing config. Required: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (from the EAS production environment) and E2E_PASSWORD."
  );
  process.exit(1);
}

// A service-role key here would bypass RLS: refuse it outright. Both legacy
// JWTs and new-style secret keys are detectable.
if (anonKey.startsWith("sb_secret_") || /"role"\s*:\s*"service_role"/.test(decodeJwtPayload(anonKey))) {
  console.error("Refusing to run: the key is a service-role key. This script must run as the E2E user under RLS.");
  process.exit(1);
}

function decodeJwtPayload(key) {
  const part = key.split(".")[1];
  if (!part) return "";
  try {
    return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

const supabase = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function signInOrSignUp() {
  const signIn = await supabase.auth.signInWithPassword({ email: E2E_EMAIL, password });
  if (!signIn.error && signIn.data.user) return signIn.data.user;

  // Only "no such account / wrong password" falls through to sign-up; any
  // other failure (network, rate limit) should stop the run, not create noise.
  const msg = signIn.error?.message ?? "";
  if (!/invalid login credentials/i.test(msg)) {
    throw new Error(`sign-in failed: ${msg}`);
  }

  const signUp = await supabase.auth.signUp({ email: E2E_EMAIL, password });
  if (signUp.error) {
    // An existing account whose password no longer matches E2E_PASSWORD lands
    // here as "already registered". Without an admin key it can't be reset
    // from CI; say exactly what to do.
    throw new Error(
      `sign-up failed: ${signUp.error.message}. If ${E2E_EMAIL} already exists on production with a different password, reset its password in the Supabase dashboard to match the E2E_PASSWORD secret.`
    );
  }
  if (!signUp.data.session) {
    throw new Error("sign-up returned no session: email confirmation must be on. The flow can't sign in until it's confirmed.");
  }
  console.log(`created ${E2E_EMAIL} on production`);
  return signUp.data.user;
}

/** Photo objects before rows: once the rows are gone the paths are lost (bucket is public). */
async function deletePhotos(moments) {
  const paths = [
    ...new Set(moments.flatMap((m) => [...(m.photo_urls ?? []), ...(m.photo_thumbnails ?? [])])),
  ].filter(Boolean);
  if (paths.length === 0) return 0;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) throw new Error(`storage remove failed: ${error.message}`);
  return paths.length;
}

const user = await signInOrSignUp();

const { data: moments, error: selectError } = await supabase
  .from("moments")
  .select("id, photo_urls, photo_thumbnails")
  .eq("user_id", user.id);
if (selectError) throw new Error(`select moments failed: ${selectError.message}`);

const photoCount = await deletePhotos(moments ?? []);

if ((moments ?? []).length > 0) {
  const { error: deleteError } = await supabase.from("moments").delete().eq("user_id", user.id);
  if (deleteError) throw new Error(`delete moments failed: ${deleteError.message}`);
}

// The profile row comes from a signup trigger. onboarding_completed must be
// true or the app routes to onboarding and the flow's tab-create wait spins.
const { error: profileError } = await supabase
  .from("profiles")
  .update({ display_name: "E2E", onboarding_completed: true })
  .eq("id", user.id);
if (profileError) throw new Error(`update profile failed: ${profileError.message}`);

// Verify the state the flow depends on, rather than trusting the writes.
const { count, error: countError } = await supabase
  .from("moments")
  .select("id", { count: "exact", head: true })
  .eq("user_id", user.id);
if (countError) throw new Error(`count moments failed: ${countError.message}`);
if (count !== 0) throw new Error(`expected 0 moments after reset, found ${count}`);

await supabase.auth.signOut({ scope: "local" });

console.log(`reset ${E2E_EMAIL} on production (${user.id})`);
console.log(`  deleted ${moments?.length ?? 0} moment(s), ${photoCount} photo object(s); onboarding complete`);
