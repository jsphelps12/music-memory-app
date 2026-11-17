// "Last week" (1.4): the week just ended, handed back as the raw material for
// moments: songs added to the library, songs played a lot, songs streamed,
// and the camera photos of each day. Everything here is pure and tested
// (lib/__tests__/lastWeek.test.ts); lib/lastWeekData.ts reads the phone, and
// app/last-week.tsx plus components/LastWeekRow.tsx draw it.
//
// Lessons from the photos ↔ music prototype (ROADMAP, 2026-11-17): adding an
// album gives every track the same date, so an album add is one row; a day
// with dozens of adds is a sync or import, not a choice; and play counts are
// lifetime totals, so "played this week" needs last week's counts kept on the
// phone.

import { BULK_DAY_THRESHOLD, dayKey } from "@/lib/libraryMoments";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The recap for a week becomes available Sunday at this hour, local time. */
export const RECAP_HOUR_SUNDAY = 18;

/** This many songs from one album added on one day read as "added the album". */
export const ALBUM_ADD_MIN = 3;

/** With weekly counts known, this many plays in the week is "played a lot". */
export const PLAYED_A_LOT_MIN = 3;

/** At most this many played and streamed rows, so the week stays a week. */
export const MAX_PLAYED = 8;
export const MAX_STREAMED = 8;

/** Fewer photos than this and no songs: a quiet week, no row. */
export const QUIET_PHOTO_MIN = 3;

export interface WeekRange {
  /** Monday 00:00 local, epoch ms. */
  start: number;
  /** The next Monday 00:00 local, epoch ms (exclusive). */
  end: number;
  /** Monday's day key, "2026-11-10": the week's identity in storage. */
  key: string;
}

/** Monday 00:00 local of the week containing `ms`. */
export function weekStartOf(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

function weekFrom(start: number): WeekRange {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end: end.getTime(), key: dayKey(start) };
}

/** The week containing `now`. */
export function currentWeek(now: number): WeekRange {
  return weekFrom(weekStartOf(now));
}

/**
 * The week being recapped at `now`: from Sunday evening the week that's
 * ending, before that the one that ended last Sunday.
 */
export function lastWeekRange(now: number): WeekRange {
  const d = new Date(now);
  const thisWeek = weekStartOf(now);
  if (d.getDay() === 0 && d.getHours() >= RECAP_HOUR_SUNDAY) return weekFrom(thisWeek);
  const prev = new Date(thisWeek);
  prev.setDate(prev.getDate() - 7);
  return weekFrom(prev.getTime());
}

export function inWeek(ms: number | undefined, week: WeekRange): ms is number {
  return ms !== undefined && ms >= week.start && ms < week.end;
}

/** "Nov 10–16" (or "Dec 29 – Jan 4" across months). */
export function weekLabel(week: WeekRange, locale = "en-US"): string {
  const first = new Date(week.start);
  const last = new Date(week.end - DAY_MS / 2);
  const month = (d: Date) => d.toLocaleDateString(locale, { month: "short" });
  if (first.getMonth() === last.getMonth()) {
    return `${month(first)} ${first.getDate()}–${last.getDate()}`;
  }
  return `${month(first)} ${first.getDate()} – ${month(last)} ${last.getDate()}`;
}

/** "Saturday, Nov 15" for a day key. */
export function dayLabel(key: string, locale = "en-US"): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
}

/** "Saturday" for a day key. */
export function weekdayName(key: string, locale = "en-US"): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: "long" });
}

// ── Songs ──────────────────────────────────────────────────────────────────

export interface LibraryTrack {
  persistentId: string;
  storeId: string;
  title: string;
  artistName: string;
  albumTitle?: string;
  albumId?: string;
  dateAdded: number;
  playCount: number;
  lastPlayed?: number;
}

export interface StreamedTrack {
  storeId: string;
  title: string;
  artistName: string;
  albumTitle?: string;
  artworkUrl?: string;
  /** When the app first saw it in Apple Music's recently played list. */
  firstSeen: number;
}

export type WeekSongReason = "added" | "played" | "streamed";

export interface WeekSong {
  /** Stable within the week: storeId when known, else the library id. */
  key: string;
  storeId: string | null;
  title: string;
  artistName: string;
  albumTitle: string;
  artworkUrl?: string;
  reason: WeekSongReason;
  /** Day key the song belongs to. */
  day: string;
  /** When it happened (added, last played, or first seen streaming), epoch ms. */
  at: number;
  /** Plays during the week when known, else the lifetime count. */
  plays: number;
  playsAreWeekly: boolean;
  /** For an album add: how many tracks came with it (this one included). */
  albumTracks?: number;
}

/** Play counts at the start of a week, keyed by library persistentId. */
export type PlayCounts = Record<string, number>;

/**
 * Plays during the week for a library track: (counts at the week's end, or
 * now for a week still ending) minus counts at its start. Null when the
 * start wasn't recorded.
 */
export function weeklyPlays(
  track: Pick<LibraryTrack, "persistentId" | "playCount">,
  atStart: PlayCounts | null,
  atEnd: PlayCounts | null
): number | null {
  if (!atStart) return null;
  const before = atStart[track.persistentId] ?? 0;
  const after = atEnd ? (atEnd[track.persistentId] ?? track.playCount) : track.playCount;
  return Math.max(0, after - before);
}

function storeKey(t: { storeId: string; persistentId?: string }): string {
  return t.storeId || `lib:${t.persistentId ?? ""}`;
}

/**
 * The week's songs, by reason:
 * - added: added to the library during the week; three or more from one
 *   album on one day are one row led by the most played track; days that
 *   look like a sync or import are left out.
 * - played: played during the week and not added that week; with weekly
 *   counts known, at least PLAYED_A_LOT_MIN plays; most played first.
 * - streamed: seen in Apple Music's recently played during the week and not
 *   in the library rows above.
 */
export function buildWeekSongs(input: {
  week: WeekRange;
  library: LibraryTrack[];
  streamed: StreamedTrack[];
  countsAtStart: PlayCounts | null;
  countsAtEnd: PlayCounts | null;
}): WeekSong[] {
  const { week, library, streamed, countsAtStart, countsAtEnd } = input;

  const addedThisWeek = library.filter((t) => inWeek(t.dateAdded, week));
  const perDay = new Map<string, number>();
  for (const t of addedThisWeek) perDay.set(dayKey(t.dateAdded), (perDay.get(dayKey(t.dateAdded)) ?? 0) + 1);

  // Group the adds by day and album.
  const groups = new Map<string, LibraryTrack[]>();
  for (const t of addedThisWeek) {
    const day = dayKey(t.dateAdded);
    if ((perDay.get(day) ?? 0) > BULK_DAY_THRESHOLD) continue;
    const album = t.albumId && t.albumId !== "0" ? t.albumId : `single:${t.persistentId}`;
    const k = `${day}|${album}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const added: WeekSong[] = [];
  const addedKeys = new Set<string>();
  for (const tracks of groups.values()) {
    const rows = tracks.length >= ALBUM_ADD_MIN ? [tracks.reduce((a, b) => (b.playCount > a.playCount ? b : a))] : tracks;
    for (const t of rows) {
      const weekly = weeklyPlays(t, countsAtStart, countsAtEnd);
      added.push({
        key: storeKey(t),
        storeId: t.storeId || null,
        title: t.title,
        artistName: t.artistName,
        albumTitle: t.albumTitle ?? "",
        reason: "added",
        day: dayKey(t.dateAdded),
        at: t.dateAdded,
        plays: weekly ?? t.playCount,
        playsAreWeekly: weekly !== null,
        albumTracks: tracks.length >= ALBUM_ADD_MIN ? tracks.length : undefined,
      });
    }
    for (const t of tracks) addedKeys.add(storeKey(t));
  }

  const played: WeekSong[] = library
    .filter((t) => inWeek(t.lastPlayed, week) && !addedKeys.has(storeKey(t)))
    .map((t) => {
      const weekly = weeklyPlays(t, countsAtStart, countsAtEnd);
      return {
        key: storeKey(t),
        storeId: t.storeId || null,
        title: t.title,
        artistName: t.artistName,
        albumTitle: t.albumTitle ?? "",
        reason: "played" as const,
        day: dayKey(t.lastPlayed!),
        at: t.lastPlayed!,
        plays: weekly ?? t.playCount,
        playsAreWeekly: weekly !== null,
      };
    })
    .filter((s) => !s.playsAreWeekly || s.plays >= PLAYED_A_LOT_MIN)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, MAX_PLAYED);

  const libraryKeys = new Set(library.map((t) => t.storeId).filter(Boolean));
  const seen = new Set<string>();
  const streamedRows: WeekSong[] = streamed
    .filter((s) => inWeek(s.firstSeen, week) && s.storeId && !libraryKeys.has(s.storeId))
    .sort((a, b) => b.firstSeen - a.firstSeen)
    .filter((s) => (seen.has(s.storeId) ? false : (seen.add(s.storeId), true)))
    .slice(0, MAX_STREAMED)
    .map((s) => ({
      key: s.storeId,
      storeId: s.storeId,
      title: s.title,
      artistName: s.artistName,
      albumTitle: s.albumTitle ?? "",
      artworkUrl: s.artworkUrl,
      reason: "streamed" as const,
      day: dayKey(s.firstSeen),
      at: s.firstSeen,
      plays: 0,
      playsAreWeekly: false,
    }));

  return [...added, ...played, ...streamedRows];
}

/** The meta line under a song: why it's here. */
export function songReasonLine(song: WeekSong): string {
  if (song.reason === "added") {
    if (song.albumTracks && song.albumTracks > 1) {
      const others = song.albumTracks - 1;
      const from = song.albumTitle ? ` from ${song.albumTitle}` : "";
      return `Added with ${others} other${others === 1 ? "" : "s"}${from}`;
    }
    return "Added to your library";
  }
  if (song.reason === "played") {
    if (song.playsAreWeekly) return `Played ${song.plays} ${song.plays === 1 ? "time" : "times"}`;
    return "Played this week";
  }
  return "Played on Apple Music";
}

// ── Photos and days ────────────────────────────────────────────────────────

export interface WeekPhoto {
  id: string;
  uri: string;
  /** Epoch ms. */
  createdAt: number;
}

export interface WeekDay {
  key: string;
  songs: WeekSong[];
  photos: WeekPhoto[];
}

/** Songs and photos by day, newest day first; days with neither are left out. */
export function groupByDay(songs: WeekSong[], photos: WeekPhoto[]): WeekDay[] {
  const days = new Map<string, WeekDay>();
  const at = (key: string) => {
    let d = days.get(key);
    if (!d) days.set(key, (d = { key, songs: [], photos: [] }));
    return d;
  };
  for (const s of songs) at(s.day).songs.push(s);
  for (const p of [...photos].sort((a, b) => a.createdAt - b.createdAt)) at(dayKey(p.createdAt)).photos.push(p);
  return [...days.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** A week worth a row: any song, or a handful of photos. */
export function weekHasContent(songCount: number, photoCount: number): boolean {
  return songCount > 0 || photoCount >= QUIET_PHOTO_MIN;
}

// ── The Journal row ────────────────────────────────────────────────────────

export type LastWeekAccess = "granted" | "undetermined" | "denied";

/**
 * What the Journal shows: nothing, the one-time ask for access, or the row.
 * The ask appears once (until answered or dismissed); a dismissed week stays
 * dismissed; a quiet week shows nothing.
 */
export function lastWeekRowState(input: {
  week: WeekRange;
  access: LastWeekAccess;
  askDismissed: boolean;
  dismissedWeek: string | null;
  hasContent: boolean | null;
}): "hidden" | "ask" | "row" {
  const { week, access, askDismissed, dismissedWeek, hasContent } = input;
  if (dismissedWeek === week.key) return "hidden";
  if (access === "undetermined") return askDismissed ? "hidden" : "ask";
  if (access === "denied") return "hidden";
  return hasContent ? "row" : "hidden";
}
