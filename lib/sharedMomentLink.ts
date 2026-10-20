import { supabase } from "@/lib/supabase";

/**
 * Opening a /m/{token} share link while signed in.
 *
 * The lookup goes through the `open_shared_moment` RPC, which is tied to the
 * token's current value (clearing or rotating the link ends access) and
 * records nothing for the caller. The owner gets their moment's id and opens
 * the normal detail screen; anyone else gets a read-only projection that
 * app/m/[token].tsx renders with no edit, delete or share.
 */

/** What a non-owner sees: the public fields of the moment plus its sender. */
export interface SharedMomentView {
  id: string;
  songTitle: string;
  songArtist: string;
  songAlbumName: string | null;
  songArtworkUrl: string | null;
  songPreviewUrl: string | null;
  songAppleMusicId: string | null;
  reflectionText: string | null;
  photoUrls: string[];
  photoThumbnails: string[];
  momentDate: string | null;
  moods: string[];
  location: string | null;
  senderName: string | null;
  senderAvatarUrl: string | null;
  senderFriendToken: string | null;
}

/**
 * `detail` opens the normal detail screen: the owner's own moment (or, on a
 * server without the RPC, any moment the user can read).
 */
export type OpenSharedMomentResult =
  | { kind: "not_found" }
  | { kind: "detail"; id: string }
  | { kind: "view"; moment: SharedMomentView };

const asString = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

/** Pure mapping of the RPC's jsonb result. */
export function mapOpenSharedMoment(data: unknown): OpenSharedMomentResult {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  const id = asString(row?.id);
  if (!row || !id) return { kind: "not_found" };
  if (row.is_owner === true) return { kind: "detail", id };

  const moods = asStringArray(row.moods);
  const legacyMood = asString(row.mood);
  return {
    kind: "view",
    moment: {
      id,
      songTitle: asString(row.song_title) ?? "",
      songArtist: asString(row.song_artist) ?? "",
      songAlbumName: asString(row.song_album_name),
      songArtworkUrl: asString(row.song_artwork_url),
      songPreviewUrl: asString(row.song_preview_url),
      songAppleMusicId: asString(row.song_apple_music_id),
      reflectionText: asString(row.reflection_text),
      photoUrls: asStringArray(row.photo_urls),
      photoThumbnails: asStringArray(row.photo_thumbnails),
      momentDate: asString(row.moment_date),
      // Dual-read, as mapRowToMoment: rows from older builds only have `mood`.
      moods: moods.length > 0 ? moods : legacyMood ? [legacyMood] : [],
      location: asString(row.location),
      senderName: asString(row.sender_name),
      senderAvatarUrl: asString(row.sender_avatar_url),
      senderFriendToken: asString(row.sender_friend_token),
    },
  };
}

/**
 * The RPC isn't on the server yet (PostgREST: function not in the schema
 * cache; Postgres: undefined function). Lets an OTA ship before the migration.
 */
export function isMissingRpcError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Resolve a share token for the signed-in user. Throws on a failed request,
 * so the screen can tell "this link doesn't work" from "couldn't check".
 */
export async function openSharedMoment(token: string): Promise<OpenSharedMomentResult> {
  const { data, error } = await supabase.rpc("open_shared_moment", { p_token: token });
  if (!error) return mapOpenSharedMoment(data);
  if (!isMissingRpcError(error)) throw error;

  // Fallback for a server without the RPC: the previous lookup, which opens
  // the moment's detail screen for anyone who can read it.
  const { data: row, error: lookupError } = await supabase
    .from("moments")
    .select("id")
    .eq("share_token", token)
    .maybeSingle();
  if (lookupError) {
    // A malformed token is "no such link", not a failure.
    if (lookupError.code === "22P02") return { kind: "not_found" };
    throw lookupError;
  }
  return row?.id ? { kind: "detail", id: row.id as string } : { kind: "not_found" };
}

// ─── Hand-off between the deep-link hook and the /m screen ──────────────────
//
// Expo Router opens /m/{token} itself. The deep-link hook only parks the token
// when the app can't show it yet (signed out, or a cold start before auth has
// restored), then opens it once the user is in. A cold start does both, so the
// screen records the tokens it has opened and the hook skips those.

const openedTokens = new Set<string>();

export function markShareTokenOpened(token: string): void {
  openedTokens.add(token);
}

export function wasShareTokenOpened(token: string): boolean {
  return openedTokens.has(token);
}
