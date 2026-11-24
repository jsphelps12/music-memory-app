/**
 * How a moment was captured, saved as `moments.capture_source`. Decided from
 * what opened capture (app/create.tsx route params) and how the song was
 * picked inside it. What started the capture wins; only a capture that
 * started blank (the + button, an empty-state button, an album page) is
 * credited to the way its song was chosen. Every way in is listed in
 * app/help.tsx. Pure: importable from vitest.
 */

/**
 * Allowed values: the CHECK constraint (20261120120000_song_metadata.sql,
 * 'background' added by 20261125000000_capture_keys.sql, 'your_day' by
 * 20261126000000_capture_source_your_day.sql). "background" is
 * only ever written by the quick-capture edge function (Siri, Shortcuts, the
 * Action button: "Remember this song"); captureSourceFor never returns it.
 */
export const CAPTURE_SOURCES = [
  "now_playing",
  "identify",
  "search",
  "share",
  "widget",
  "nudge",
  "last_week",
  "from_before",
  "draft",
  "other",
  "background",
  "your_day",
] as const;

export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

/** How the song was chosen inside capture (components/SongPickerSection). */
export type SongPick = "now_playing" | "identify" | "search";

export interface CaptureEntry {
  /** The `source` route param ("widget", "capture_menu", "last_week", "your_day", …). */
  source?: string | null;
  /** Arrived through the share extension: a shared song, link or photo. */
  shared?: boolean;
  /** A saved draft was picked back up (Continue a draft). */
  draft?: boolean;
  /** `identify=1`: opened to listen straight away. */
  identify?: boolean;
  /** `search=1`: opened straight into song search. */
  search?: boolean;
}

/**
 * The capture_source for a save. `songPick` is how the current song was
 * chosen inside capture, or null when it came in with the route (a share,
 * Last week, a draft).
 */
export function captureSourceFor(entry: CaptureEntry, songPick: SongPick | null): CaptureSource {
  const source = entry.source || null;
  // These carry their own song and photos in the share params, so they come
  // before the share check.
  if (source === "last_week") return "last_week";
  // Apple's Journaling Suggestions picker (long-press + → Your day).
  if (source === "your_day") return "your_day";
  // Rediscover's "On this day" pairings come from the same library history.
  if (source === "from_before" || source === "on_this_day_phone") return "from_before";
  if (entry.shared) return "share";
  if (source === "widget") return "widget";
  if (source === "daily_checkin") return "nudge";
  if (entry.draft) return "draft";
  if (entry.identify) return "identify";
  if (entry.search) return "search";
  // The long-press menu's rows are covered above; a source nobody mapped yet
  // shows up as "other" rather than being credited to the song pick.
  if (source && source !== "capture_menu") return "other";
  return songPick ?? "other";
}
