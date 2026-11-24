// "Your soundtrack with <person>": the short header above a person's moments
// (app/browse/person.tsx). Pure; tested in lib/__tests__/personSoundtrack.test.ts.
//
// Glanceable, not a dashboard: a count line, up to three artists, up to three
// mood words, and a line is left out when it has nothing to say. Artist and
// mood ranking reuse lib/insights.ts, so "most written about" means the same
// thing here as on Insights.

import { artistHighlights, journalInsights, type RankedArtist } from "@/lib/insights";
import { moodWords, type MoodLabelDefinition } from "@/lib/moodLabels";
import { monthKeyOf, monthLabel } from "@/lib/monthGroups";

/**
 * The person's moments as the screen already has them (fetchPersonMoments,
 * newest first). Already filtered to the person server-side; card rows carry
 * no `people`, so nothing here matches names.
 */
export type PersonSoundtrackMoment = {
  momentDate: string | null;
  songTitle: string;
  songArtist: string;
  songArtworkUrl: string;
  moods: readonly string[];
};

export interface PersonSoundtrack {
  /** "8 moments together · since March 2024" */
  summary: string;
  /**
   * Up to three artists: the ones that repeat with this person, or before any
   * do, the most recent ones with their song. Null when there's too little.
   */
  artists: { kind: "repeats" | "recent"; artists: RankedArtist[] } | null;
  /** "Joyful · nostalgic · peaceful", or null when no mood has a label. */
  moods: string | null;
}

export const PERSON_TOP_ARTISTS = 3;
export const PERSON_TOP_MOODS = 3;

/**
 * Below this, artists and moods would only repeat the one row under them; the
 * count line still shows.
 */
export const PERSON_DETAIL_MIN_MOMENTS = 2;

/** "8 moments together", plus " · since March 2024" when the moments span more than a month. */
export function togetherLine(moments: readonly Pick<PersonSoundtrackMoment, "momentDate">[]): string {
  const n = moments.length;
  const count = `${n.toLocaleString()} ${n === 1 ? "moment" : "moments"} together`;

  let first: string | null = null;
  let latest: string | null = null;
  for (const m of moments) {
    const key = monthKeyOf(m.momentDate);
    if (!key) continue;
    if (first === null || key < first) first = key;
    if (latest === null || key > latest) latest = key;
  }
  return first && latest && first !== latest ? `${count} · since ${monthLabel(first)}` : count;
}

/** A tile's second line: a count once it means something; before that, the song. */
export function artistTileDetail(a: Pick<RankedArtist, "count" | "latestSong">): string {
  return a.count > 1 ? `${a.count.toLocaleString()} moments` : a.latestSong || "1 moment";
}

/** The header model, or null when there are no moments (no header then). */
export function personSoundtrack(
  moments: readonly PersonSoundtrackMoment[],
  allMoods: readonly MoodLabelDefinition[]
): PersonSoundtrack | null {
  if (moments.length === 0) return null;

  const summary = togetherLine(moments);
  if (moments.length < PERSON_DETAIL_MIN_MOMENTS) return { summary, artists: null, moods: null };

  // People don't matter here (every moment is with this person).
  const insights = journalInsights(moments.map((m) => ({ ...m, people: [] })));
  const highlights = artistHighlights(insights, PERSON_TOP_ARTISTS);
  const words = moodWords(
    insights.moods.map((m) => m.value),
    allMoods,
    PERSON_TOP_MOODS
  );

  return {
    summary,
    artists: highlights.artists.length > 0 ? highlights : null,
    moods: words || null,
  };
}
