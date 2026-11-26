/**
 * Fill the E2E account on PRODUCTION with the sample moments in
 * marketing/videos/demo-moments.json, for screen recordings.
 *
 * Resets the account first with scripts/reset-e2e-prod.mjs (same rules: signs
 * in as the E2E account with the anon key, so RLS limits every write to that
 * account's own rows). Song artwork, ids and preview URLs come from the public
 * iTunes Search API, so cards look like real captures. Photos come from
 * marketing/videos/photos/ (full size) and the 400px thumbnails make.py writes
 * to marketing/videos/out/photo-thumbs/, uploaded under the account's own
 * folder exactly as the app does ({uid}/{uuid}.jpg + {uid}/thumb_{uuid}.jpg).
 *
 * Usage (scripts/video/make.py runs it for you):
 *   npx eas-cli env:exec production "node scripts/video/seed-demo.mjs"
 * with E2E_PASSWORD in the environment.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const E2E_EMAIL = "e2e@soundtracks.test";
const PHOTOS = join(ROOT, "marketing/videos/photos");
const THUMBS = join(ROOT, "marketing/videos/out/photo-thumbs");

execFileSync("node", [join(ROOT, "scripts/reset-e2e-prod.mjs")], { stdio: "inherit", env: { ...process.env, E2E_SEED: "0" } });

const demo = JSON.parse(readFileSync(join(ROOT, "marketing/videos/demo-moments.json"), "utf8"));
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: E2E_EMAIL,
  password: process.env.E2E_PASSWORD,
});
if (authError) throw new Error(`sign-in failed: ${authError.message}`);
const userId = auth.user.id;

async function lookup(song, artist) {
  const term = encodeURIComponent(`${song} ${artist}`);
  const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5&country=us`);
  if (!res.ok) throw new Error(`iTunes search failed for ${song}: ${res.status}`);
  const { results } = await res.json();
  const hit = results.find((r) => r.artistName.toLowerCase().includes(artist.toLowerCase())) ?? results[0];
  if (!hit) throw new Error(`no iTunes result for ${song} by ${artist}`);
  return hit;
}

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};

async function upload(path, file) {
  const { error } = await supabase.storage
    .from("moment-photos")
    .upload(path, readFileSync(file), { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`upload ${path} failed: ${error.message}`);
}

async function uploadPhotos(names = []) {
  const full = [];
  const thumbs = [];
  for (const name of names) {
    const src = join(PHOTOS, `${name}.jpg`);
    const thumb = join(THUMBS, `${name}.jpg`);
    if (!existsSync(src) || !existsSync(thumb)) {
      throw new Error(`missing photo ${name} (need ${src} and ${thumb}; make.py writes thumbnails)`);
    }
    const id = randomUUID();
    await upload(`${userId}/${id}.jpg`, src);
    await upload(`${userId}/thumb_${id}.jpg`, thumb);
    full.push(`${userId}/${id}.jpg`);
    thumbs.push(`${userId}/thumb_${id}.jpg`);
  }
  return { full, thumbs };
}

const rows = [];
let photoCount = 0;
for (const m of demo.moments) {
  const hit = await lookup(m.song, m.artist);
  const photos = await uploadPhotos(m.photos);
  photoCount += photos.full.length;
  rows.push({
    user_id: userId,
    song_title: m.song,
    song_artist: m.artist,
    song_album_name: hit.collectionName ?? null,
    song_artwork_url: hit.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
    song_apple_music_id: String(hit.trackId),
    song_preview_url: hit.previewUrl ?? null,
    song_provider: "apple",
    reflection_text: m.reflection,
    moment_date: day(m.days_ago),
    time_of_day: m.time_of_day,
    location: m.location,
    moods: m.moods,
    people: m.people ?? [],
    weather_condition: m.weather ?? null,
    weather_temp_f: m.temp_f ?? null,
    photo_urls: photos.full,
    photo_thumbnails: photos.thumbs,
  });
}

const { error: insertError } = await supabase.from("moments").insert(rows);
if (insertError) throw new Error(`insert demo moments failed: ${insertError.message}`);
const { error: profileError } = await supabase
  .from("profiles")
  .update({ display_name: demo.display_name })
  .eq("id", userId);
if (profileError) throw new Error(`update profile failed: ${profileError.message}`);

await supabase.auth.signOut({ scope: "local" });
console.log(`seeded ${rows.length} demo moment(s) with ${photoCount} photo(s) into ${E2E_EMAIL}`);
