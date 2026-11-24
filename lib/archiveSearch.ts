// Rediscover's archive search (components/MomentSearch.tsx).
//
// Two halves, merged:
// - the server: an `ilike` over song title, artist, the words written and the
//   place (momentSearchOrFilter in lib/browse.ts), newest 50;
// - the phone: album name, people's names and moods, matched against the
//   BrowseMeta the screen already holds (no extra query), case- and
//   accent-insensitive. Only the rows for those ids are read, by id.
//
// A result that matched only on a phone field, or on the place, says why in
// its subtitle ("With Sam", "At Ocean Beach", "Nostalgic", "From Rumours").

import { supabase } from "@/lib/supabase";
import { compareLibraryOrder, fetchMomentsByIds, momentSearchOrFilter, type BrowseMeta } from "@/lib/browse";
import { mapRowToMoment } from "@/lib/moments";
import { MOMENT_SEARCH_COLUMNS } from "@/lib/momentColumns";
import { moodLabel, type MoodLabelDefinition } from "@/lib/moodLabels";
import { nameKey, normalizeName, tidyName } from "@/lib/people";
import type { Moment } from "@/types";

/** Results shown for one search, and how many each half may contribute. */
export const SEARCH_RESULT_LIMIT = 50;

export interface ArchiveSearchResult {
  moment: Moment;
  /** Why it matched, when nothing in its title, artist or words did. */
  why: string | null;
}

/** Normalized substring test; `q` is already normalized and non-empty. */
function has(field: string | null | undefined, q: string): boolean {
  return !!field && normalizeName(field).includes(q);
}

function matchingMoodLabels(
  moods: readonly string[],
  q: string,
  allMoods: readonly MoodLabelDefinition[]
): string[] {
  return moods
    .map((value) => moodLabel(value, allMoods))
    .filter((label): label is string => !!label && has(label, q));
}

/**
 * Ids of the moments whose album name, people or moods match, in the order
 * BrowseMeta holds them (library order: newest first, undated last), at most
 * `limit`. Since both halves are the newest `limit` of their own matches, the
 * newest `limit` of the union is always among them.
 */
export function localSearchMatches(
  meta: readonly BrowseMeta[],
  text: string,
  allMoods: readonly MoodLabelDefinition[],
  limit = SEARCH_RESULT_LIMIT
): string[] {
  const q = normalizeName(text);
  if (!q) return [];
  const ids: string[] = [];
  for (const m of meta) {
    if (
      has(m.songAlbumName, q) ||
      m.people.some((name) => has(name, q)) ||
      matchingMoodLabels(m.moods, q, allMoods).length > 0
    ) {
      ids.push(m.id);
      if (ids.length >= limit) break;
    }
  }
  return ids;
}

/**
 * The subtitle for a result that didn't match on its title, artist or words,
 * or null when one of those did (the row shows the reflection then). People
 * first, then the place, the mood, the album.
 */
export function searchWhyLine(
  moment: Pick<Moment, "songTitle" | "songArtist" | "reflectionText" | "people" | "location" | "moods" | "songAlbumName">,
  text: string,
  allMoods: readonly MoodLabelDefinition[]
): string | null {
  const q = normalizeName(text);
  if (!q) return null;
  if ([moment.songTitle, moment.songArtist, moment.reflectionText].some((f) => has(f, q))) return null;

  const people = (moment.people ?? []).filter((name) => has(name, q)).map(tidyName);
  if (people.length > 0) return `With ${people.join(", ")}`;
  if (has(moment.location, q)) return `At ${tidyName(moment.location!)}`;
  const moods = matchingMoodLabels(moment.moods ?? [], q, allMoods);
  if (moods.length > 0) return moods.join(", ");
  if (has(moment.songAlbumName, q)) return `From ${tidyName(moment.songAlbumName)}`;
  return null;
}

/** Server and phone matches together: one per id, library order, at most `limit`. */
export function mergeSearchResults(
  server: readonly Moment[],
  local: readonly Moment[],
  limit = SEARCH_RESULT_LIMIT
): Moment[] {
  const byId = new Map<string, Moment>();
  for (const m of [...server, ...local]) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort(compareLibraryOrder).slice(0, limit);
}

/**
 * The people written about most, for the empty search's chips: one per name
 * (case and spacing ignored, as lib/people.ts nameKey), counted once per
 * moment, shown as most recently written. Ties go to the more recent name.
 */
export function topPeople(meta: readonly BrowseMeta[], max = 8): string[] {
  const counts = new Map<string, { label: string; count: number; first: number }>();
  meta.forEach((m, index) => {
    const seen = new Set<string>();
    for (const name of m.people) {
      const key = nameKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label: tidyName(name), count: 1, first: index });
    }
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, max)
    .map((e) => e.label);
}

/**
 * One search: the server's matches and the rows for `localIds` (from
 * localSearchMatches) read in parallel, merged, each with its "why" line.
 */
export async function searchArchive(
  userId: string,
  text: string,
  localIds: readonly string[],
  allMoods: readonly MoodLabelDefinition[]
): Promise<ArchiveSearchResult[]> {
  const query = text.trim();
  if (!query) return [];
  const [server, local] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from("moments")
        .select(MOMENT_SEARCH_COLUMNS)
        .eq("user_id", userId)
        .or(momentSearchOrFilter(query))
        // Library order with a unique tiebreak, so the newest 50 are the
        // newest 50 that order would give (the merge relies on it).
        .order("moment_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(SEARCH_RESULT_LIMIT);
      if (error) throw error;
      return (data ?? []).map(mapRowToMoment);
    })(),
    localIds.length > 0 ? fetchMomentsByIds(userId, localIds, MOMENT_SEARCH_COLUMNS) : Promise.resolve([]),
  ]);
  return mergeSearchResults(server, local).map((moment) => ({
    moment,
    why: searchWhyLine(moment, query, allMoods),
  }));
}
