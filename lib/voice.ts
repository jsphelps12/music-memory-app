import { formatSongTime } from "@/lib/songPart";

/**
 * Voice entries, v1 (docs/PLAN-1.5.md, decided 2026-11-23): a moment can keep
 * a recording of its owner saying what the song is doing for them.
 *
 * A voice is more personal than a photo, so it gets stricter rules
 * (supabase/migrations/20261124120000_voice_entries.sql):
 * - its own private bucket, `moment-voice`, each person's files in
 *   `{user_id}/`, read only through short-lived signed URLs;
 * - owner-only: the shared view leaves `voice_path` and `voice_duration_ms`
 *   out, so friends, album members and link pages never see that it exists;
 * - deleted with the moment (lib/deleteMoment.ts) and with the account
 *   (delete-account).
 *
 * Until it's saved a recording is a file on the phone (lib/voiceFiles.ts),
 * which a capture draft keeps; storage calls are in lib/voiceStorage.ts. This
 * file is the pure rules (tested in lib/__tests__/voice.test.ts).
 * No transcription: voice-to-text is the keyboard's dictation (decided
 * 2026-11-24, docs/PLAN-1.5.md decision 7).
 */

export const VOICE_BUCKET = "moment-voice";
/** The longest a recording can be: 3 minutes. */
export const MAX_VOICE_MS = 180_000;
/** Shorter than this and it was a slip of the finger, not something said. */
export const MIN_VOICE_MS = 1000;
/** The column's own limit (moments_voice_duration_ms_check): 3 minutes plus encoder slack. */
const MAX_STORED_VOICE_MS = 185_000;
/** A signed URL is asked for this long, and reused until it's this close to running out. */
export const SIGNED_URL_SECONDS = 3600;
const SIGNED_URL_MARGIN_MS = 5 * 60 * 1000;

/** A recording on this phone, not uploaded yet (capture, a draft, a new take in Edit). */
export interface LocalVoice {
  uri: string;
  durationMs: number;
}

/** What the recorder sheet shows and plays: a take on the phone, or the moment's stored one. */
export type VoiceClip =
  | { kind: "local"; uri: string; durationMs: number }
  | { kind: "stored"; path: string; durationMs: number };

/**
 * Where a moment's recording is stored. The moment id is in the name (so a
 * recording can be traced to its moment) and so is the time, so a new take
 * never reuses the old path and a cached signed URL can't play the old one.
 * The migration requires the owner's folder first.
 */
export function voicePathFor(userId: string, momentId: string, now = Date.now()): string {
  return `${userId}/${momentId}-${now}.m4a`;
}

/** Whether a path lives in this person's folder (the only paths they can store). */
export function isOwnVoicePath(path: string | null | undefined, userId: string | null | undefined): boolean {
  return !!path && !!userId && path.startsWith(`${userId}/`) && path.length > userId.length + 1;
}

/** A length as it can be stored: whole ms, never negative, within the column's limit. */
export function storableVoiceMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.min(MAX_STORED_VOICE_MS, Math.max(0, Math.round(ms)));
}

/** Whether a finished take is long enough to keep. */
export function isKeepableTake(ms: number): boolean {
  return Number.isFinite(ms) && ms >= MIN_VOICE_MS;
}

/** A finished take's length as kept: the recorder can run a tick past the cap. */
export function takeLengthMs(ms: number): number {
  return storableVoiceMs(Math.min(ms, MAX_VOICE_MS));
}

/** "0:42", for the chip, the sheet and the moment. */
export function voiceTimeLabel(ms: number): string {
  return formatSongTime(ms);
}

/**
 * What an edit does to the stored recording, for updateMoment: undefined to
 * leave it as it is, a local take to replace (or add) it, null to remove it.
 */
export function voiceEditFor(
  originalPath: string | null | undefined,
  clip: VoiceClip | null
): LocalVoice | null | undefined {
  if (clip?.kind === "local") return { uri: clip.uri, durationMs: clip.durationMs };
  // The stored one still there: nothing to write.
  if (clip?.kind === "stored") return undefined;
  return originalPath ? null : undefined;
}

// ── Takes on the phone (the file work is in lib/voiceFiles.ts) ──────────────

/** Where takes wait to be saved, under the app's documents: Documents/capture-voice/<user>/. */
export const VOICE_FILES_DIR = "capture-voice";
/**
 * A take no draft points at is deleted once it's this old. Not straight away:
 * a capture or an edit that's still open holds a take before any draft names
 * it (and Edit never writes a draft at all).
 */
export const VOICE_FILE_GRACE_MS = 24 * 60 * 60 * 1000;

/** A take's file name, with the time it was kept. */
export function voiceFileName(now: number): string {
  return `voice-${now}.m4a`;
}

/** When a take was kept, from its name; null for a name that isn't one. */
export function voiceFileTime(name: string): number | null {
  const match = /^voice-(\d+)\.m4a$/.exec(name);
  return match ? Number(match[1]) : null;
}

/** The stored (relative, lib/draftPhotos.ts storedUri) folder of a person's takes. */
export function voiceFolder(userId: string): string {
  return `doc:${VOICE_FILES_DIR}/${userId}/`;
}

/** Take file names that drafts point at, from their stored voice URIs. */
export function keptVoiceNames(
  drafts: readonly { voice?: { uri: string } | null }[],
  userId: string
): Set<string> {
  const folder = voiceFolder(userId);
  const names = new Set<string>();
  for (const d of drafts) {
    const uri = d.voice?.uri;
    if (uri?.startsWith(folder)) names.add(uri.slice(folder.length));
  }
  return names;
}

/**
 * Files in the takes folder to delete: not a take a draft points at, and
 * either not a take at all or older than the grace period.
 */
export function voiceFilesToPrune(
  names: readonly string[],
  keep: ReadonlySet<string>,
  now: number,
  graceMs = VOICE_FILE_GRACE_MS
): string[] {
  return names.filter((name) => {
    if (keep.has(name)) return false;
    const at = voiceFileTime(name);
    return at === null || now - at > graceMs;
  });
}

// ── Signed URLs ─────────────────────────────────────────────────────────────

export interface SignedUrlEntry {
  url: string;
  expiresAt: number;
}

/** A cached signed URL that's still good for a while, or null. */
export function usableCachedUrl(entry: SignedUrlEntry | undefined, now: number): string | null {
  return entry && entry.expiresAt - now > SIGNED_URL_MARGIN_MS ? entry.url : null;
}

// ── Playing a recording (hooks/useVoicePlayer.ts) ───────────────────────────

/** A play that hasn't been heard after this long (offline, a link that won't load) has failed. */
export const VOICE_LOAD_TIMEOUT_MS = 10_000;

/** What the player has loaded: the take's uri or the stored path, and when. */
export interface LoadedVoice {
  key: string;
  at: number;
}

/**
 * Whether playing `key` needs the recording loaded (again): the player has
 * nothing or another recording, or a stored one whose signed URL may have
 * run out since. A URL is handed out with at least SIGNED_URL_MARGIN_MS
 * left (usableCachedUrl), so a stored recording loaded longer ago than that
 * gets a fresh one rather than replaying through a link that has lapsed.
 */
export function voiceNeedsLoad(
  loaded: LoadedVoice | null,
  key: string,
  kind: VoiceClip["kind"],
  now: number
): boolean {
  if (!loaded || loaded.key !== key) return true;
  return kind === "stored" && now - loaded.at >= SIGNED_URL_MARGIN_MS;
}

/** What a voice player shows: whether it's heard, and where it is. */
export interface VoicePlayback {
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

export const VOICE_PLAYBACK_IDLE: VoicePlayback = { playing: false, positionMs: 0, durationMs: 0 };

/**
 * The next VoicePlayback from a player status update, or `prev` itself when
 * nothing shown has changed (so the component doesn't re-render). With
 * `withPosition` false (the film, which shows no progress) only playing or
 * not counts, so the position ticking along re-renders nothing.
 */
export function nextVoicePlayback(
  prev: VoicePlayback,
  status: { playing: boolean; currentTime: number; duration: number },
  withPosition: boolean
): VoicePlayback {
  const next: VoicePlayback = withPosition
    ? {
        playing: status.playing,
        positionMs: Number.isFinite(status.currentTime) ? Math.max(0, status.currentTime * 1000) : 0,
        durationMs: Number.isFinite(status.duration) && status.duration > 0 ? status.duration * 1000 : 0,
      }
    : { playing: status.playing, positionMs: prev.positionMs, durationMs: prev.durationMs };
  return next.playing === prev.playing && next.positionMs === prev.positionMs && next.durationMs === prev.durationMs
    ? prev
    : next;
}
