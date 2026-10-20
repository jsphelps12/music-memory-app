// Pure classification logic for scripts/sweep-orphaned-photos.mjs, split out so
// Vitest can cover it (scripts/lib/__tests__/orphans.test.mjs).
//
// Every rule here errs towards keeping an object: a false "referenced" costs a
// few KB of storage, a false "orphan" deletes someone's only copy of a photo.

const PUBLIC_PREFIX = "/moment-photos/";

/**
 * Storage path from a DB value. Values are bucket paths ("{uid}/x.jpg"), but
 * tolerate a full public URL or a leading slash from older rows.
 */
export function normalizePath(value) {
  if (typeof value !== "string") return null;
  let v = value.trim();
  if (!v) return null;
  const i = v.indexOf(PUBLIC_PREFIX);
  if (/^https?:\/\//.test(v)) {
    if (i === -1) return null; // some other host's URL: not a bucket object
    v = v.slice(i + PUBLIC_PREFIX.length);
  }
  v = v.split("?")[0].replace(/^\/+/, "");
  try {
    v = decodeURIComponent(v);
  } catch {
    // keep the raw value
  }
  return v || null;
}

function siblingsOf(path) {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const out = [];
  // Full-size avatar: uploadAvatar writes {uid}/avatar_full.jpg next to the
  // {uid}/avatar.jpg that avatar_url stores, and no column records it.
  if (name === "avatar.jpg") out.push(`${dir}avatar_full.jpg`);
  // A photo and its 400px thumbnail travel together, even when
  // photo_thumbnails is missing or out of step with photo_urls.
  if (name.startsWith("thumb_")) out.push(`${dir}${name.slice("thumb_".length)}`);
  else out.push(`${dir}thumb_${name}`);
  return out;
}

/**
 * Every storage path referenced by the given rows, plus the objects that are
 * written alongside a referenced one.
 *
 * @param {{ moments: object[], profiles: object[], collections: object[] }} rows
 */
export function referencedPaths({ moments, profiles, collections }) {
  const referenced = new Set();
  const add = (v) => {
    if (Array.isArray(v)) return v.forEach(add);
    const p = normalizePath(v);
    if (!p) return;
    referenced.add(p);
    for (const s of siblingsOf(p)) referenced.add(s);
  };
  for (const r of moments) {
    add(r.photo_urls);
    add(r.photo_thumbnails);
  }
  for (const r of profiles) add(r.avatar_url);
  for (const r of collections) add(r.cover_photo_url);
  return referenced;
}

/**
 * Objects no row references. Objects newer than minAgeMs are always kept: a
 * moment's photos are uploaded before its row is written, so a fresh object
 * may simply belong to a save still in flight.
 *
 * @param {{ path: string, created: string | null }[]} objects
 * @param {Set<string>} referenced
 */
export function findOrphans(objects, referenced, { now = Date.now(), minAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  return objects.filter((o) => {
    if (referenced.has(o.path)) return false;
    const created = o.created ? Date.parse(o.created) : NaN;
    // Unknown age counts as new.
    if (!Number.isFinite(created) || now - created < minAgeMs) return false;
    return true;
  });
}

/** Rough kind of an object, for the dry-run summary. */
export function objectKind(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (path.startsWith("guest/")) return "guest photo";
  if (path.includes("/collection_covers/")) return "album cover";
  if (name === "avatar.jpg" || name === "avatar_full.jpg") return "avatar";
  if (name.startsWith("thumb_")) return "thumbnail";
  return "photo";
}
