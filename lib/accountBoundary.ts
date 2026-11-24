// When the in-memory query cache must be emptied as one account hands over to
// the next (contexts/AuthContext.tsx). Pure; tested.
//
// The cache "belongs" to the account whose data it was filled with. It must be
// emptied the moment that account leaves (sign-out) or another one arrives,
// and never after the next account has started filling it: TanStack's
// `clear()` silently cancels in-flight queries, and a mounted screen whose
// query was cancelled that way sits with no data and no error (no albums, no
// friend count) until something re-runs it (2026-11-20, switching accounts).

/**
 * True when moving the session from `cacheOwner` to `next` crosses into a
 * different account: a sign-out (`next` null) or a different user. False on a
 * token refresh for the same user and on the first sign-in of a launch, where
 * the cache holds nobody's data yet (and the launch prefetches already in it
 * are for this user).
 */
export function isAccountBoundary(cacheOwner: string | null, next: string | null): boolean {
  return cacheOwner !== null && cacheOwner !== next;
}

/**
 * Sign-out's own teardown runs after a chain of awaits, so it may finish once
 * someone else has signed in. It may still empty the cache when nobody owns it
 * (or the leaving user still does, if the auth listener was suppressed), but
 * never when another account's queries are already in it.
 */
export function mayClearOnLeave(cacheOwner: string | null, leaving: string | null | undefined): boolean {
  return cacheOwner === null || cacheOwner === leaving;
}
