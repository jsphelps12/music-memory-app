/**
 * Backfill 400px thumbnails for moments whose photo_thumbnails is empty.
 *
 * Older moments and guest contributions (submit-guest-contribution edge fn)
 * only have full-size photo_urls; moment cards fall back to loading the
 * 1920px original. This script generates the missing thumb_ files so cards
 * load the small image instead.
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/backfill-thumbnails.mjs [--dry-run]
 *
 * Idempotent: rows that already have photo_thumbnails are never selected,
 * and existing thumb files are overwritten with identical content (upsert).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "moment-photos";
const THUMB_MAX_DIMENSION = 400; // matches compressImage() in lib/storage.ts
const JPEG_QUALITY = 80;

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

function thumbPathFor(photoPath) {
  const slash = photoPath.lastIndexOf("/");
  return `${photoPath.slice(0, slash + 1)}thumb_${photoPath.slice(slash + 1)}`;
}

/**
 * Some stored ".jpg" files are actually raw HEIC bytes (guest contributions
 * upload without format conversion) and sharp's libheif rejects them. Fall
 * back to macOS `sips`, which handles HEIC natively.
 */
function resizeWithSips(original) {
  if (process.platform !== "darwin") throw new Error("sips fallback requires macOS");
  const dir = mkdtempSync(join(tmpdir(), "thumb-"));
  try {
    const inPath = join(dir, "in.heic");
    const outPath = join(dir, "out.jpg");
    writeFileSync(inPath, original);
    execFileSync("sips", ["-Z", String(THUMB_MAX_DIMENSION), "-s", "format", "jpeg", "-s", "formatOptions", String(JPEG_QUALITY), inPath, "--out", outPath], { stdio: "pipe" });
    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function makeThumbnail(photoPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(photoPath);
  if (error) throw new Error(`download ${photoPath}: ${error.message}`);
  const original = Buffer.from(await data.arrayBuffer());

  let thumb;
  try {
    thumb = await sharp(original)
      .resize(THUMB_MAX_DIMENSION, THUMB_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch {
    thumb = resizeWithSips(original);
  }

  const thumbPath = thumbPathFor(photoPath);
  if (!dryRun) {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new Error(`upload ${thumbPath}: ${uploadError.message}`);
  }
  return thumbPath;
}

const { data: rows, error } = await supabase
  .from("moments")
  .select("id, photo_urls, photo_thumbnails")
  .or("photo_thumbnails.is.null,photo_thumbnails.eq.{}")
  .not("photo_urls", "is", null)
  .neq("photo_urls", "{}");

if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}

console.log(`${rows.length} moment(s) missing thumbnails${dryRun ? " (dry run)" : ""}`);

let ok = 0;
let failed = 0;
for (const row of rows) {
  try {
    const thumbPaths = [];
    for (const photoPath of row.photo_urls) {
      thumbPaths.push(await makeThumbnail(photoPath));
    }
    if (!dryRun) {
      const { error: updateError } = await supabase
        .from("moments")
        .update({ photo_thumbnails: thumbPaths })
        .eq("id", row.id);
      if (updateError) throw new Error(`update row: ${updateError.message}`);
    }
    ok++;
    console.log(`✓ ${row.id} (${thumbPaths.length} photo${thumbPaths.length === 1 ? "" : "s"})`);
  } catch (e) {
    failed++;
    console.error(`✗ ${row.id}: ${e.message}`);
  }
}

console.log(`done — ${ok} backfilled, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
