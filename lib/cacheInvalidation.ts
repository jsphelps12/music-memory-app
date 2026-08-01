/**
 * Centralised React Query invalidation for moment, album + friend mutations.
 *
 * WHY THIS EXISTS
 * ---------------
 * A single row in `moments` is rendered by a dozen different query caches:
 * the Reflections tab, the browse metadata (moods/people/years/albums/artists),
 * the profile stats counters, the map, and every drill-down list ("all moments
 * for this artist", "all moments tagged 2019", …). Same story for albums: the
 * Albums tab, its unread badge, and the album detail screen each hold their own
 * copy.
 *
 * Historically each mutation only invalidated whatever the screen it lived on
 * happened to read, so after a create/edit/delete the *other* surfaces kept
 * serving the pre-mutation snapshot until their 2-minute staleTime expired —
 * the UI lied about what the user had just done (deleted moments still listed,
 * new moments missing from browse, stats counters off by one).
 *
 * Every moment/album/friend mutation must therefore go through these helpers
 * instead of hand-picking keys at the call site. When a new moment-, album- or
 * friend-backed query is added, add its key here rather than to one screen's
 * mutation.
 *
 * NOTE: the timeline tab does not use React Query — it keeps its own state and
 * AsyncStorage cache — so `markTimelineStale` / `markTimelineDeleted` from
 * `lib/timelineRefresh.ts` are still required alongside these calls.
 */
import type { QueryClient } from "@tanstack/react-query";

/**
 * Screen-level queries whose keys are exactly `[name, userId]`.
 */
const MOMENT_SCREEN_KEYS = [
  "browseMeta",
  "reflections",
  "reflections-random",
  "profileStats",
  "momentsMap",
] as const;

/**
 * Drill-down queries keyed `[name, userId, ...filters]` — the filter segments
 * vary per screen, so these are matched by name + user prefix instead of being
 * enumerated exhaustively.
 */
const MOMENT_DRILLDOWN_KEYS: ReadonlySet<string> = new Set([
  "song-moments",
  "album-moments",
  "albumMoments",
  "artist-moments",
  "artistSpotlightMoments",
  "personMoments",
  "yearMoments",
  "moodMoments",
  "browseSearch",
  "weeklyRewind",
]);

/**
 * Invalidate every cache that renders moment data for this user. Call after a
 * moment is created, edited or deleted, or moved in/out of an album.
 */
export function invalidateMomentCaches(queryClient: QueryClient, userId: string | undefined): void {
  if (!userId) return;

  for (const name of MOMENT_SCREEN_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [name, userId] });
  }

  void queryClient.invalidateQueries({
    predicate: (query) => {
      const [name, keyUserId] = query.queryKey;
      return typeof name === "string" && MOMENT_DRILLDOWN_KEYS.has(name) && keyUserId === userId;
    },
  });
}

/**
 * Invalidate every cache that renders album data for this user. Pass `albumId`
 * when the mutation targeted a specific album so its detail screen refetches
 * too.
 */
export function invalidateAlbumCaches(
  queryClient: QueryClient,
  userId: string | undefined,
  albumId?: string
): void {
  if (!userId) return;

  void queryClient.invalidateQueries({ queryKey: ["collectionsScreen", userId] });
  void queryClient.invalidateQueries({ queryKey: ["collectionsBadge", userId] });

  if (albumId) {
    void queryClient.invalidateQueries({ queryKey: ["album", albumId, userId] });
  }
}

/**
 * Invalidate every cache that renders the friend list for this user. Call
 * after a friend is added (invite link accepted) or removed.
 */
export function invalidateFriendCaches(queryClient: QueryClient, userId: string | undefined): void {
  if (!userId) return;

  void queryClient.invalidateQueries({ queryKey: ["friendsList", userId] });
}
