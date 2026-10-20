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
 *     node scripts/sweep-orphaned-photos.mjs            # dry run (default), lists only
 *     node scripts/sweep-orphaned-photos.mjs --list     # dry run, print every orphan
 *     node scripts/sweep-orphaned-photos.mjs --delete   # actually removes
 *
 * Options:
 *   --min-age-hours=N         keep anything younger than N hours (default 24)
 *   --max-orphan-fraction=F   refuse --delete if more than F of the bucket
 *                             would go (default 0.2)
 *
 * Always run the dry run first and read the output. The bucket is the only
 * copy of user photos, so the script stops on any failed query rather than
 * guessing, and the classification rules (scripts/lib/orphans.mjs) err
 * towards keeping an object.
 */
import { createClient } from "@supabase/supabase-js";
import { findOrphans, objectKind, referencedPaths } from "./lib/orphans.mjs";

const BUCKET = "moment-photos";
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = process.argv.slice(2);
const doDelete = args.includes("--delete");
const listAll = args.includes("--list");

function numberArg(name, fallback) {
  const raw = args.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const n = Number(raw.slice(name.length + 3));
  if (!Number.isFinite(n) || n < 0) {
    console.error(`--${name} must be a non-negative number`);
    process.exit(1);
  }
  return n;
}
const minAgeHours = numberArg("min-age-hours", 24);
const maxOrphanFraction = numberArg("max-orphan-fraction", 0.2);

const known = /^--(delete|list|min-age-hours=.*|max-orphan-fraction=.*)$/;
const unknown = args.filter((a) => !known.test(a));
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(" ")}`);
  process.exit(1);
}

if (!url || !serviceKey) {
  console.error(
    "Missing credentials. The service-role key bypasses RLS, so it is read from\n" +
      "the environment rather than stored here. Your copy is in web/.env.local:\n\n" +
      "  set -a; source web/.env.local; set +a; \\\n" +
      "  SUPABASE_URL=\"$NEXT_PUBLIC_SUPABASE_URL\" node scripts/sweep-orphaned-photos.mjs\n\n" +
      "Add --delete once you've reviewed the dry-run output."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

/**
 * Every row of a table, paged. PostgREST caps each response (max_rows, 1000 by
 * default), so a single select silently drops the rest. Pages advance by what
 * actually came back and stop only on an empty page, so a server cap smaller
 * than PAGE can't end the read early.
 */
async function selectAll(table, columns) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
  }
  return rows;
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

// Sequential on purpose: any failure throws and ends the run before anything
// is classified, let alone deleted.
const moments = await selectAll("moments", "id, photo_urls, photo_thumbnails");
const profiles = await selectAll("profiles", "id, avatar_url");
const collections = await selectAll("collections", "id, cover_photo_url");
const referenced = referencedPaths({ moments, profiles, collections });
const objects = await allObjects();

if (moments.length === 0 || referenced.size === 0) {
  console.error(
    `Refusing to continue: read ${moments.length} moments and ${referenced.size} referenced paths. ` +
      "An empty read almost certainly means a wrong project or a failed query, not an empty app."
  );
  process.exit(1);
}

const orphans = findOrphans(objects, referenced, { minAgeMs: minAgeHours * 60 * 60 * 1000 });
const totalMb = (n) => (n / 1024 / 1024).toFixed(1);
const fraction = objects.length ? orphans.length / objects.length : 0;

console.log(`rows read:         ${moments.length} moments, ${profiles.length} profiles, ${collections.length} albums`);
console.log(`referenced by DB:  ${referenced.size} (incl. thumbnail and full-size avatar siblings)`);
console.log(`objects in bucket: ${objects.length} (${totalMb(objects.reduce((a, o) => a + o.size, 0))} MB)`);
console.log(
  `orphaned:          ${orphans.length} (${totalMb(orphans.reduce((a, o) => a + o.size, 0))} MB, ` +
    `${(fraction * 100).toFixed(1)}% of the bucket; objects under ${minAgeHours}h old are kept)`
);

if (orphans.length === 0) process.exit(0);

const byKind = new Map();
for (const o of orphans) byKind.set(objectKind(o.path), (byKind.get(objectKind(o.path)) ?? 0) + 1);
console.log("\nOrphans by kind:");
for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${kind}`);

const sorted = [...orphans].sort((a, b) => String(a.created).localeCompare(String(b.created)));
console.log(listAll ? "\nAll orphans:" : "\nOldest 10 orphans (--list prints all):");
for (const o of listAll ? sorted : sorted.slice(0, 10)) {
  console.log(`  ${String(o.created).slice(0, 10)}  ${totalMb(o.size).padStart(6)} MB  ${o.path}`);
}

if (!doDelete) {
  console.log(`\nDry run — nothing deleted. Re-run with --delete to remove these ${orphans.length} objects.`);
  process.exit(0);
}

if (fraction > maxOrphanFraction) {
  console.error(
    `\nRefusing to delete ${(fraction * 100).toFixed(1)}% of the bucket ` +
      `(limit ${(maxOrphanFraction * 100).toFixed(0)}%). Check the list above with --list; ` +
      "if it is right, re-run with a higher --max-orphan-fraction."
  );
  process.exit(1);
}

let removed = 0;
let failed = 0;
for (let i = 0; i < orphans.length; i += 100) {
  const batch = orphans.slice(i, i + 100).map((o) => o.path);
  const { error } = await supabase.storage.from(BUCKET).remove(batch);
  if (error) {
    failed += batch.length;
    console.error(`batch failed: ${error.message}`);
  } else removed += batch.length;
}
console.log(`\nDeleted ${removed}/${orphans.length} orphaned objects.`);
if (failed) process.exit(1);
