/**
 * Find (and optionally delete) storage objects in `moment-photos` that no
 * database row references.
 *
 * Nothing deleted objects for most of this app's life, so photos from deleted
 * moments, replaced avatars, and failed uploads accumulated. They stay
 * publicly readable at deterministic URLs, so this is a privacy cleanup as
 * well as a cost one.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/sweep-orphaned-photos.mjs            # dry run, lists only
 *     node scripts/sweep-orphaned-photos.mjs --delete   # actually removes
 *
 * Always run the dry run first and read the output.
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "moment-photos";
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const doDelete = process.argv.includes("--delete");

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

/** Every storage path currently referenced by a DB row. */
async function referencedPaths() {
  const referenced = new Set();
  const add = (v) => {
    if (typeof v === "string" && v) referenced.add(v);
    else if (Array.isArray(v)) v.forEach(add);
  };

  const [moments, profiles, collections] = await Promise.all([
    supabase.from("moments").select("photo_urls, photo_thumbnails"),
    supabase.from("profiles").select("avatar_url"),
    supabase.from("collections").select("cover_photo_url"),
  ]);
  for (const r of moments.data ?? []) { add(r.photo_urls); add(r.photo_thumbnails); }
  for (const r of profiles.data ?? []) add(r.avatar_url);
  for (const r of collections.data ?? []) add(r.cover_photo_url);
  return referenced;
}

/** Recursively list every object path in the bucket. */
async function allObjects(prefix = "") {
  const PAGE = 100;
  const out = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Entries with no id are folders.
      if (entry.id === null) out.push(...(await allObjects(path)));
      else out.push({ path, size: entry.metadata?.size ?? 0, created: entry.created_at });
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

const referenced = await referencedPaths();
const objects = await allObjects();
const orphans = objects.filter((o) => !referenced.has(o.path));
const totalMb = (n) => (n / 1024 / 1024).toFixed(1);

console.log(`referenced by DB: ${referenced.size}`);
console.log(`objects in bucket: ${objects.length} (${totalMb(objects.reduce((a, o) => a + o.size, 0))} MB)`);
console.log(`orphaned:          ${orphans.length} (${totalMb(orphans.reduce((a, o) => a + o.size, 0))} MB)`);

if (orphans.length === 0) process.exit(0);

console.log("\nOldest 10 orphans:");
for (const o of [...orphans].sort((a, b) => String(a.created).localeCompare(String(b.created))).slice(0, 10)) {
  console.log(`  ${String(o.created).slice(0, 10)}  ${totalMb(o.size).padStart(6)} MB  ${o.path}`);
}

if (!doDelete) {
  console.log(`\nDry run — nothing deleted. Re-run with --delete to remove these ${orphans.length} objects.`);
  process.exit(0);
}

let removed = 0;
for (let i = 0; i < orphans.length; i += 100) {
  const batch = orphans.slice(i, i + 100).map((o) => o.path);
  const { error } = await supabase.storage.from(BUCKET).remove(batch);
  if (error) console.error(`batch failed: ${error.message}`);
  else removed += batch.length;
}
console.log(`\nDeleted ${removed}/${orphans.length} orphaned objects.`);
