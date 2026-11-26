// quick-capture: saves the playing song as a moment for the owner of a
// capture key ("Remember this song" from Siri, Shortcuts and the Action
// button; docs/PLAN-1.5.md section 3). Called by the App Intent in the app
// (plugins/remember-this-song), never by the JavaScript app.
//
// Not a user-JWT function (verify_jwt = false): it authenticates the key
// itself. The key is looked up by its SHA-256 (the secret is never stored,
// logged or echoed); a revoked, unknown or expired (over 90 days old) key is
// refused. The moment is
// inserted with the service role and user_id from the key row, never from
// the request. This is the only service-role write path for a user's own
// moments (guest contributions aside). Nothing is sent afterwards: no push,
// no notification (Josh, 2026-11-23).
//
//   POST   Authorization: Capture <secret>
//          { appleMusicId?, title, artist, album?, country?,
//            capturedAt (ISO 8601), utcOffsetMinutes? }
//          country (build 21+) is the storefront for the lookup; without it
//          the lookup uses the US store. Unknown fields are ignored, an
//          artworkUrl included: artwork only comes from the lookup.
//          Never sets the part of the song: it's only picked by hand.
//          A double fire saves one moment (save.ts); the second call gets
//          the first moment back with duplicate: true.
//          -> 200 { momentId, title, artist, duplicate }
//          400 invalid body · 401 bad/revoked key · 413 too large ·
//          429 too many saves this hour · 500 server error
//   DELETE Authorization: Capture <secret>  -> 200 { revoked: true }
//          The key revokes itself: the app does this with a key it finds
//          left behind on a signed-out phone (after a reinstall).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  captureKeyFromHeader,
  EMPTY_SONG_LOOKUP,
  hasLookupDetails,
  itunesLookupUrl,
  keyIsLive,
  LIMITS,
  parseQuickCaptureBody,
  type RecentCapture,
  sha256Hex,
  songLookupFromResponse,
  type SongLookup,
} from "../_shared/quickCapture.ts";
import { type CaptureStore, saveBackgroundMoment } from "./save.ts";

const LOOKUP_TIMEOUT_MS = 4000;
const CAPTURE_COLUMNS = "id, song_title, song_artist, created_at";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function lookupOnce(appleMusicId: string, country: string | null, signal: AbortSignal): Promise<SongLookup> {
  try {
    const res = await fetch(itunesLookupUrl(appleMusicId, country), { signal });
    if (!res.ok) return EMPTY_SONG_LOOKUP;
    return songLookupFromResponse(await res.json(), appleMusicId);
  } catch {
    return EMPTY_SONG_LOOKUP;
  }
}

/**
 * The iTunes lookup for the preview and song details, in the phone's
 * storefront when it sent one. If that finds nothing (a region that isn't
 * the storefront), the US store is tried, as before country existed. Both
 * share one 4 s budget. Never throws.
 */
async function lookupSong(appleMusicId: string, country: string | null): Promise<SongLookup> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const found = await lookupOnce(appleMusicId, country, controller.signal);
    if (hasLookupDetails(found) || !country || controller.signal.aborted) return found;
    return await lookupOnce(appleMusicId, null, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function captureStore(admin: SupabaseClient): CaptureStore {
  return {
    async countBackgroundSaves(userId, sinceIso) {
      const { count, error } = await admin
        .from("moments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("capture_source", "background")
        .gte("created_at", sinceIso);
      if (error) throw error;
      return count ?? 0;
    },
    async recentCaptures(userId, title, artist, sinceIso) {
      const { data, error } = await admin
        .from("moments")
        .select(CAPTURE_COLUMNS)
        .eq("user_id", userId)
        .eq("capture_source", "background")
        .eq("song_title", title)
        .eq("song_artist", artist)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(20)
        .returns<RecentCapture[]>();
      if (error) throw error;
      return data ?? [];
    },
    async insertMoment(row) {
      const { data, error } = await admin.from("moments").insert(row).select(CAPTURE_COLUMNS).single<RecentCapture>();
      if (error) throw error;
      return data;
    },
    async updateLookup(momentId, userId, appleMusicId, columns) {
      const { error } = await admin
        .from("moments")
        .update(columns)
        .eq("id", momentId)
        .eq("user_id", userId)
        // Not if the moment's song was changed in the app meanwhile.
        .eq("song_apple_music_id", appleMusicId);
      if (error) throw error;
    },
    async deleteMoment(momentId, userId) {
      // A background save has no photos, so there are no storage objects.
      const { error } = await admin.from("moments").delete().eq("id", momentId).eq("user_id", userId);
      if (error) throw error;
    },
    lookupSong,
  };
}

async function readBody(req: Request): Promise<unknown | "too_large" | "invalid"> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > LIMITS.bodyMaxBytes) return "too_large";
  let text: string;
  try {
    text = await req.text();
  } catch {
    return "invalid";
  }
  if (new TextEncoder().encode(text).length > LIMITS.bodyMaxBytes) return "too_large";
  try {
    return JSON.parse(text);
  } catch {
    return "invalid";
  }
}

type KeyRow = { id: string; user_id: string; created_at: string; revoked_at: string | null };

async function save(admin: SupabaseClient, key: KeyRow, req: Request) {
  const raw = await readBody(req);
  if (raw === "too_large") return json(413, { error: "too_large" });
  if (raw === "invalid") return json(400, { error: "invalid_body" });
  const now = Date.now();
  const parsed = parseQuickCaptureBody(raw, now);
  if (!parsed.ok) return json(400, { error: parsed.error });

  const touch = admin
    .from("capture_keys")
    .update({ last_used_at: new Date(now).toISOString() })
    .eq("id", key.id)
    .then(({ error }) => {
      if (error) console.error("[quick-capture] last_used_at update failed:", error.message);
    });
  try {
    const outcome = await saveBackgroundMoment(captureStore(admin), key.user_id, parsed.value, now);
    return json(outcome.status, outcome.body);
  } finally {
    await touch;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "DELETE") return json(405, { error: "method_not_allowed" });

  // Malformed or missing keys are refused before any database work.
  const secret = captureKeyFromHeader(req.headers.get("Authorization"));
  if (!secret) return json(401, { error: "invalid_key" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Looked up by hash: the hash is the only thing compared, so there is no
    // secret-dependent string comparison to time.
    const { data: key, error: keyError } = await admin
      .from("capture_keys")
      .select("id, user_id, created_at, revoked_at")
      .eq("key_hash", await sha256Hex(secret))
      .maybeSingle<KeyRow>();
    if (keyError) throw keyError;
    if (!key || key.revoked_at) return json(401, { error: "invalid_key" });
    if (!keyIsLive(key, Date.now())) {
      // Expired: mark it so it shows as revoked, then refuse like any other.
      const { error } = await admin
        .from("capture_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", key.id)
        .is("revoked_at", null);
      if (error) console.error("[quick-capture] expiring a key failed:", error.message);
      return json(401, { error: "invalid_key" });
    }

    if (req.method === "DELETE") {
      const { error } = await admin
        .from("capture_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", key.id)
        .is("revoked_at", null);
      if (error) throw error;
      return json(200, { revoked: true });
    }

    return await save(admin, key, req);
  } catch (e) {
    // Database and lookup messages only; the secret never reaches a log.
    console.error("[quick-capture] failed:", (e as { message?: string })?.message ?? "unknown");
    return json(500, { error: "server_error" });
  }
});
