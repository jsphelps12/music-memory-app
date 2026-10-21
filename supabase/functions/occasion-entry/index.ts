import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cleanAppleMusicId,
  cleanDeviceId,
  cleanEmail,
  cleanName,
  cleanSlug,
  cleanWords,
  clientIp,
  isUuid,
  LIMITS,
  newEditToken,
  rateLimitError,
  sameHex,
  sha256Hex,
  sniffImage,
  songFromLookup,
  type ImageKind,
} from "../_shared/occasionEntry.ts";

// Guest capture for occasions (docs/OCCASIONS.md). Guests have no session:
// the page at /for/{slug} posts here directly (verify_jwt = false). Two
// actions, both multipart/form-data:
//
//   create: slug, appleMusicId, guestName, words?, deviceId?, photo?
//           → { entryId, editToken, photoSaved }
//   update: entryId, editToken, words?, guestEmail?, photo?
//           → { photoSaved }
//
// Everything stored is validated here: the song comes from Apple's catalog
// (the client only names a track id), the photo's type comes from its bytes,
// and the edit token is only ever stored as a hash.

const BUCKET = "occasion-photos";
const HOUR_MS = 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const failWith = (status: number, error: string) => json(status, { error });

type Occasion = { id: string; status: string; collect_closes_at: string | null };

function isAccepting(o: Occasion): boolean {
  return o.status === "collecting" && (!o.collect_closes_at || Date.now() < Date.parse(o.collect_closes_at));
}

/** Reads and checks an optional photo field. undefined = none sent. */
async function readPhoto(
  value: FormDataEntryValue | null
): Promise<{ bytes: Uint8Array; kind: ImageKind } | undefined | string> {
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (value.size > LIMITS.photoMaxBytes) return "That photo is too big. Try another one.";
  const bytes = new Uint8Array(await value.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return "That photo didn't come through as an image. Try another one.";
  return { bytes, kind };
}

async function lookupSong(appleMusicId: string) {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${appleMusicId}&entity=song`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`itunes lookup ${res.status}`);
  return songFromLookup(await res.json(), appleMusicId);
}

async function uploadPhoto(
  admin: SupabaseClient,
  occasionId: string,
  entryId: string,
  photo: { bytes: Uint8Array; kind: ImageKind }
): Promise<string | null> {
  const path = `${occasionId}/entries/${entryId}.${photo.kind.ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, photo.bytes, {
    contentType: photo.kind.contentType,
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) {
    console.error("[occasion-entry] photo upload failed:", error.message);
    return null;
  }
  return path;
}

/** Entries for an occasion, optionally only one device's or address's since a time. */
async function countEntries(
  admin: SupabaseClient,
  occasionId: string,
  only?: { column: "device_id" | "ip_hash"; value: string; since: string }
): Promise<number> {
  let query = admin
    .from("occasion_entries")
    .select("id", { count: "exact", head: true })
    .eq("occasion_id", occasionId);
  if (only) query = query.eq(only.column, only.value).gte("created_at", only.since);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function create(admin: SupabaseClient, form: FormData, headers: Headers) {
  const slug = cleanSlug(form.get("slug"));
  const appleMusicId = cleanAppleMusicId(form.get("appleMusicId"));
  const name = cleanName(form.get("guestName"));
  const words = cleanWords(form.get("words"));
  const deviceId = cleanDeviceId(form.get("deviceId"));
  if (!slug) return failWith(404, "We couldn't find this guest book. Check the link and try again.");
  if (!appleMusicId) return failWith(400, "Pick a song first.");
  if (!name.ok) return failWith(400, name.error);
  if (!words.ok) return failWith(400, words.error);

  const photo = await readPhoto(form.get("photo"));
  if (typeof photo === "string") return failWith(400, photo);

  const { data: occasion, error: occasionError } = await admin
    .from("occasions")
    .select("id, status, collect_closes_at")
    .eq("slug", slug)
    .maybeSingle<Occasion>();
  if (occasionError) throw occasionError;
  if (!occasion || occasion.status === "draft") {
    return failWith(404, "We couldn't find this guest book. Check the link and try again.");
  }
  if (!isAccepting(occasion)) return failWith(409, "This guest book has closed. Thank you for coming.");

  const ip = clientIp(headers);
  const ipHash = ip ? await sha256Hex(`${occasion.id}:${ip}`) : null;
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const recent = (column: "device_id" | "ip_hash", value: string | null) =>
    value ? countEntries(admin, occasion.id, { column, value, since }) : Promise.resolve(0);
  const [device, ipCount, total] = await Promise.all([
    recent("device_id", deviceId),
    recent("ip_hash", ipHash),
    countEntries(admin, occasion.id),
  ]);
  const limited = rateLimitError({ device, ip: ipCount, total });
  if (limited) return failWith(429, limited);

  let song;
  try {
    song = await lookupSong(appleMusicId);
  } catch (e) {
    console.error("[occasion-entry] song lookup failed:", (e as Error).message);
    return failWith(502, "We couldn't reach Apple Music just now. Try again in a moment.");
  }
  if (!song) return failWith(400, "We couldn't find that song. Pick it again.");

  const editToken = newEditToken();
  const { data: entry, error: insertError } = await admin
    .from("occasion_entries")
    .insert({
      occasion_id: occasion.id,
      guest_name: name.value,
      words: words.value,
      song_apple_id: song.appleMusicId,
      song_title: song.title,
      song_artist: song.artist,
      song_album: song.album,
      song_artwork_url: song.artworkUrl,
      song_preview_url: song.previewUrl,
      edit_token_hash: await sha256Hex(editToken),
      device_id: deviceId,
      ip_hash: ipHash,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError) throw insertError;

  // The moment is saved before the photo: a failed upload loses nothing,
  // and the guest can add the photo again with their edit token.
  let photoSaved = false;
  if (photo) {
    const path = await uploadPhoto(admin, occasion.id, entry.id, photo);
    if (path) {
      const { error } = await admin
        .from("occasion_entries")
        .update({ photo_source: "guest", photo_path: path, gallery_photo_id: null })
        .eq("id", entry.id);
      if (error) console.error("[occasion-entry] photo link failed:", error.message);
      else photoSaved = true;
    }
  }

  return json(201, { entryId: entry.id, editToken, photoSaved });
}

async function update(admin: SupabaseClient, form: FormData) {
  const entryId = form.get("entryId");
  const editToken = form.get("editToken");
  if (!isUuid(entryId) || typeof editToken !== "string" || editToken.length > 100) {
    return failWith(403, "This link can't change that moment.");
  }

  const changes: Record<string, unknown> = {};
  if (form.has("words")) {
    const words = cleanWords(form.get("words"));
    if (!words.ok) return failWith(400, words.error);
    changes.words = words.value;
  }
  if (form.has("guestEmail")) {
    const email = cleanEmail(form.get("guestEmail"));
    if (!email.ok) return failWith(400, email.error);
    changes.guest_email = email.value;
  }
  const photo = await readPhoto(form.get("photo"));
  if (typeof photo === "string") return failWith(400, photo);
  if (!photo && Object.keys(changes).length === 0) return failWith(400, "Nothing to change.");

  const { data: entry, error } = await admin
    .from("occasion_entries")
    .select("id, occasion_id, edit_token_hash, photo_path, occasions!inner(id, status, collect_closes_at)")
    .eq("id", entryId)
    .maybeSingle<{
      id: string;
      occasion_id: string;
      edit_token_hash: string;
      photo_path: string | null;
      occasions: Occasion;
    }>();
  if (error) throw error;
  if (!entry || !sameHex(entry.edit_token_hash, await sha256Hex(editToken))) {
    return failWith(403, "This link can't change that moment.");
  }
  if (!isAccepting(entry.occasions)) return failWith(409, "This guest book has closed, so moments can't change now.");

  let photoSaved = false;
  if (photo) {
    const path = await uploadPhoto(admin, entry.occasion_id, entry.id, photo);
    if (!path) return failWith(502, "That photo didn't upload. Try again.");
    // A guest's own photo replaces a gallery fill.
    Object.assign(changes, { photo_source: "guest", photo_path: path, gallery_photo_id: null });
    photoSaved = true;
    if (entry.photo_path && entry.photo_path !== path) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove([entry.photo_path]);
      if (removeError) console.error("[occasion-entry] old photo remove failed:", removeError.message);
    }
  }

  const { error: updateError } = await admin.from("occasion_entries").update(changes).eq("id", entry.id);
  if (updateError) throw updateError;
  return json(200, { photoSaved });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return failWith(405, "Method not allowed.");

  try {
    if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      return failWith(400, "multipart/form-data required");
    }
    const form = await req.formData();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    switch (form.get("action")) {
      case "create":
        return await create(admin, form, req.headers);
      case "update":
        return await update(admin, form);
      default:
        return failWith(400, "Unknown action.");
    }
  } catch (e) {
    console.error("[occasion-entry] failed:", (e as Error)?.message ?? e);
    return failWith(500, "Something went wrong saving that. Try again.");
  }
});
