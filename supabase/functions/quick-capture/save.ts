// The background save itself, apart from Supabase and Deno so vitest can run
// it against a fake store (save.test.ts). index.ts supplies the real store.
//
// A double fire (Siri retrying, the Action button pressed twice) must make
// one moment. The row goes in first, with no song details, and the slow
// iTunes lookup (up to 4 s) fills them in afterwards, so a second save
// almost always finds the first in its duplicate check. For two saves that
// really do run side by side, each re-reads the matching rows after its own
// insert and the later copy removes itself (keptCapture picks the same row
// for both). No migration, no lock: the only ordering both need is the
// rows' own created_at and id.

import {
  backgroundMomentRow,
  hasLookupDetails,
  keptCapture,
  LIMITS,
  type QuickCaptureInput,
  type RecentCapture,
  songLookupColumns,
  type SongLookup,
} from "../_shared/quickCapture.ts";

const HOUR_MS = 60 * 60 * 1000;

export interface CaptureStore {
  /** Background saves by this person since `sinceIso`. Throws on error. */
  countBackgroundSaves(userId: string, sinceIso: string): Promise<number>;
  /** Background moments of this song since `sinceIso`. Throws on error. */
  recentCaptures(userId: string, title: string, artist: string, sinceIso: string): Promise<RecentCapture[]>;
  /** Throws on error. */
  insertMoment(row: ReturnType<typeof backgroundMomentRow>): Promise<RecentCapture>;
  /** Fills in the lookup columns; only while the row still has this song. */
  updateLookup(
    momentId: string,
    userId: string,
    appleMusicId: string,
    columns: ReturnType<typeof songLookupColumns>
  ): Promise<void>;
  deleteMoment(momentId: string, userId: string): Promise<void>;
  /** Never throws. */
  lookupSong(appleMusicId: string, country: string | null): Promise<SongLookup>;
}

export type SaveOutcome =
  | { status: 429; body: { error: "rate_limited" } }
  | { status: 200; body: { momentId: string; title: string; artist: string; duplicate: boolean } };

const answer = (m: RecentCapture, duplicate: boolean): SaveOutcome => ({
  status: 200,
  body: { momentId: m.id, title: m.song_title, artist: m.song_artist, duplicate },
});

function logFailure(what: string, e: unknown) {
  console.error(`[quick-capture] ${what} failed:`, (e as { message?: string })?.message ?? "unknown");
}

export async function saveBackgroundMoment(
  store: CaptureStore,
  userId: string,
  input: QuickCaptureInput,
  nowMs: number
): Promise<SaveOutcome> {
  const count = await store.countBackgroundSaves(userId, new Date(nowMs - HOUR_MS).toISOString());
  if (count >= LIMITS.savesPerHour) return { status: 429, body: { error: "rate_limited" } };

  // The same song saved moments ago: hand back that one instead of a copy.
  // Right before the insert, with nothing slow in between.
  const since = new Date(nowMs - LIMITS.duplicateWindowMs).toISOString();
  const earlier = keptCapture(await store.recentCaptures(userId, input.title, input.artist, since));
  if (earlier) return answer(earlier, true);

  const mine = await store.insertMoment(backgroundMomentRow(userId, input));

  // A save running alongside this one may have inserted too. If its copy is
  // the one to keep, remove ours and answer with it. If this re-read fails,
  // keep ours: a rare second copy beats losing the capture.
  try {
    const kept = keptCapture([mine, ...(await store.recentCaptures(userId, input.title, input.artist, since))]);
    if (kept && kept.id !== mine.id) {
      try {
        await store.deleteMoment(mine.id, userId);
      } catch (e) {
        logFailure("removing a duplicate", e);
      }
      return answer(kept, true);
    }
  } catch (e) {
    logFailure("the duplicate re-check", e);
  }

  // The song's details. The moment is already saved, so a failed lookup or
  // update leaves it without them rather than failing the save.
  if (input.appleMusicId) {
    const lookup = await store.lookupSong(input.appleMusicId, input.country);
    if (hasLookupDetails(lookup)) {
      try {
        await store.updateLookup(mine.id, userId, input.appleMusicId, songLookupColumns(input, lookup));
      } catch (e) {
        logFailure("writing the song details", e);
      }
    }
  }

  return answer(mine, false);
}
