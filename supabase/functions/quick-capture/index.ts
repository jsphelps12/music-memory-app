// quick-capture: saves the playing song as a moment for the owner of a
// capture key ("Remember this song" from Siri, Shortcuts and the Action
// button; docs/PLAN-1.5.md section 3). Called by the App Intent in the app
// (plugins/remember-this-song), never by the JavaScript app.
//
// Not a user-JWT function (verify_jwt = false): it authenticates the key
// itself. The key is looked up by its SHA-256 (the secret is never stored,
// logged or echoed); a revoked or unknown key is refused. The moment is
// inserted with the service role and user_id from the key row, never from
// the request. This is the only service-role write path for a user's own
// moments (guest contributions aside). Nothing is sent afterwards: no push,
// no notification (Josh, 2026-11-23).
//
//   POST   Authorization: Capture <secret>
//          { appleMusicId?, title, artist, album?, artworkUrl?, durationMs?,
//            positionMs?, capturedAt (ISO 8601), utcOffsetMinutes? }
//          -> 200 { momentId, title, artist, duplicate }
//          400 invalid body · 401 bad/revoked key · 413 too large ·
//          429 too many saves this hour · 500 server error
//   DELETE Authorization: Capture <secret>  -> 200 { revoked: true }
//          The key revokes itself: the app does this with a key it finds
//          left behind on a signed-out phone (after a reinstall).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  backgroundMomentRow,
  captureKeyFromHeader,
  EMPTY_SONG_LOOKUP,
  LIMITS,
  parseQuickCaptureBody,
  sha256Hex,
  songLookupFromResponse,
  type SongLookup,
} from "../_shared/quickCapture.ts";

const HOUR_MS = 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** The iTunes lookup for the preview and song details. Never throws. */
async function lookupSong(appleMusicId: string): Promise<SongLookup> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appleMusicId)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return EMPTY_SONG_LOOKUP;
    return songLookupFromResponse(await res.json(), appleMusicId);
  } catch {
    return EMPTY_SONG_LOOKUP;
  } finally {
    clearTimeout(timeout);
  }
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

type KeyRow = { id: string; user_id: string; revoked_at: string | null };

async function save(admin: SupabaseClient, key: KeyRow, req: Request) {
  const raw = await readBody(req);
  if (raw === "too_large") return json(413, { error: "too_large" });
  if (raw === "invalid") return json(400, { error: "invalid_body" });
  const parsed = parseQuickCaptureBody(raw, Date.now());
  if (!parsed.ok) return json(400, { error: parsed.error });
  const input = parsed.value;
  const userId = key.user_id;

  // Background saves this person made in the last hour.
  const now = Date.now();
  const { count, error: countError } = await admin
    .from("moments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("capture_source", "background")
    .gte("created_at", new Date(now - HOUR_MS).toISOString());
  if (countError) throw countError;
  if ((count ?? 0) >= LIMITS.savesPerHour) return json(429, { error: "rate_limited" });

  // The same song saved moments ago: Siri retrying, or said twice. Hand back
  // the first one instead of a second copy.
  const { data: recent, error: recentError } = await admin
    .from("moments")
    .select("id, song_title, song_artist")
    .eq("user_id", userId)
    .eq("capture_source", "background")
    .eq("song_title", input.title)
    .eq("song_artist", input.artist)
    .gte("created_at", new Date(now - LIMITS.duplicateWindowMs).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; song_title: string; song_artist: string }>();
  if (recentError) throw recentError;

  const touch = admin
    .from("capture_keys")
    .update({ last_used_at: new Date(now).toISOString() })
    .eq("id", key.id)
    .then(({ error }) => {
      if (error) console.error("[quick-capture] last_used_at update failed:", error.message);
    });

  if (recent) {
    await touch;
    return json(200, { momentId: recent.id, title: recent.song_title, artist: recent.song_artist, duplicate: true });
  }

  const lookup = input.appleMusicId ? await lookupSong(input.appleMusicId) : EMPTY_SONG_LOOKUP;
  const { data: moment, error: insertError } = await admin
    .from("moments")
    .insert(backgroundMomentRow(userId, input, lookup))
    .select("id, song_title, song_artist")
    .single<{ id: string; song_title: string; song_artist: string }>();
  await touch;
  if (insertError) throw insertError;

  return json(200, { momentId: moment.id, title: moment.song_title, artist: moment.song_artist, duplicate: false });
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
      .select("id, user_id, revoked_at")
      .eq("key_hash", await sha256Hex(secret))
      .maybeSingle<KeyRow>();
    if (keyError) throw keyError;
    if (!key || key.revoked_at) return json(401, { error: "invalid_key" });

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
