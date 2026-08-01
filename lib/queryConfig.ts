/**
 * Per-query-key staleTime constants.
 *
 * WHY THIS EXISTS
 * ---------------
 * `staleTime` in React Query is a property of the *observer* (the `useQuery`
 * call), not of the cache entry. When two screens observe the SAME query key
 * with DIFFERENT staleTimes, the entry's refetch behaviour is decided by
 * whichever observer happens to be mounted — so "is this data fresh?" depends
 * on the order the user navigated, not on anything deliberate. That produced a
 * real split: `["browseMeta", userId]` was observed at 60s from the five browse
 * screens and at 120s from the Reflections tab, so the same cached metadata was
 * treated as stale or fresh nondeterministically, and Reflections' spotlight
 * artist could disagree with Browse's counts.
 *
 * Rule: a query key has exactly ONE staleTime. Import it from here; never
 * write the literal at the call site. When a new observer of an existing key is
 * added, it must use the same constant.
 *
 * (Exception, and it is not a violation: `queryClient.prefetchQuery` takes
 * `staleTime` as a one-shot "how fresh must the entry be for me to skip this
 * fetch?" threshold, not as an observer setting. The launch prefetch in
 * `contexts/AuthContext.tsx` deliberately passes 0 there so a `setQueryData`
 * from the disk cache doesn't turn the network prefetch into a no-op.)
 *
 * Choosing a value — the convention from CLAUDE.md:
 *   - 2 minutes for screen-level queries
 *   - 60s for small badge / count queries that drive a visible unread dot
 * Every moment-backed cache is explicitly invalidated on create/edit/delete by
 * `lib/cacheInvalidation.ts`, so a longer staleTime does not risk showing
 * post-mutation stale data — it only avoids redundant refetches.
 */

/** Baseline for screen-level queries. */
export const DEFAULT_SCREEN_STALE = 2 * 60 * 1000;

/**
 * `["browseMeta", userId]` — observed by the Browse tab, all four browse
 * drill-downs, and the Reflections spotlight. One row per moment for the whole
 * library, so the largest of these payloads; invalidated on every moment
 * mutation. 2 min (was 60s in the browse screens: twice the requests for
 * freshness that invalidation already guarantees).
 */
export const BROWSE_META_STALE = DEFAULT_SCREEN_STALE;

/**
 * `["personMoments"|"yearMoments"|"moodMoments"|"albumMoments", userId, …]` —
 * browse drill-down lists. Full moment rows, same invalidation coverage as
 * browseMeta, and the user typically taps through several facets in one
 * session. Screen-level, so 2 min rather than the 60s they used to carry.
 */
export const BROWSE_DRILLDOWN_STALE = DEFAULT_SCREEN_STALE;

/**
 * `["browseSearch", userId, query]` — one entry per distinct search term, so
 * these accumulate quickly. Kept short: a search result should reflect a moment
 * the user just edited when they come back and retype the same term.
 */
export const BROWSE_SEARCH_STALE = 10_000;

/** `["taggedMoments", userId]` — moments other users tagged you in. */

/** `["reflections", userId]` and `["artistSpotlightMoments", userId, artist]`. */
export const REFLECTIONS_STALE = DEFAULT_SCREEN_STALE;

/**
 * `["reflections-random", userId]` — the shuffled hero moment. Never goes stale
 * on its own: it must stay put across tab navigations and change only when the
 * user taps shuffle (an explicit `refetch`).
 */
export const REFLECTIONS_RANDOM_STALE = Infinity;

/**
 * `["profileStats", userId]` — the Me tab's counters, streaks and badges.
 * Also the cooldown for the profile row refresh on that tab's focus effect.
 */
export const PROFILE_STATS_STALE = DEFAULT_SCREEN_STALE;

/**
 * Debounce applied to the browse search box before the text reaches the query
 * key. Long enough that a typed word is one request instead of one per
 * keystroke, short enough to still feel like search-as-you-type.
 */
export const SEARCH_DEBOUNCE_MS = 275;
