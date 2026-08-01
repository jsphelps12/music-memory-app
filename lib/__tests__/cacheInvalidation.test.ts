/**
 * lib/cacheInvalidation.ts is the one module in the data layer with no runtime
 * dependencies — its only import is `import type { QueryClient }` — so these
 * tests drive a real QueryClient with no mocks at all. That matters: the thing
 * worth testing is React Query's own prefix/predicate matching semantics, and a
 * stubbed client would only test the stub.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateMomentCaches, invalidateAlbumCaches } from "../cacheInvalidation";

const USER = "user-aaa";
const OTHER_USER = "user-bbb";

let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient({
    // No retries/refetch: these queries have no observers, we only care whether
    // invalidateQueries flipped isInvalidated.
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});

/** Seed a query into the cache so there is something for invalidation to match. */
function seed(key: readonly unknown[]) {
  qc.setQueryData(key, { seeded: true });
}

function isInvalidated(key: readonly unknown[]): boolean {
  return qc.getQueryState(key)?.isInvalidated === true;
}

const MOMENT_SCREEN_KEYS = [
  "browseMeta",
  "reflections",
  "reflections-random",
  "profileStats",
  "momentsMap",
];

const MOMENT_DRILLDOWN_KEYS = [
  "song-moments",
  "album-moments",
  "albumMoments",
  "artist-moments",
  "artistSpotlightMoments",
  "personMoments",
  "yearMoments",
  "moodMoments",
  "browseSearch",
];

describe("invalidateMomentCaches", () => {
  it("invalidates every moment screen key for the user", () => {
    for (const name of MOMENT_SCREEN_KEYS) seed([name, USER]);

    invalidateMomentCaches(qc, USER);

    for (const name of MOMENT_SCREEN_KEYS) {
      expect(isInvalidated([name, USER]), `${name} should be invalidated`).toBe(true);
    }
  });

  it("invalidates every drill-down key regardless of its trailing filter segments", () => {
    for (const name of MOMENT_DRILLDOWN_KEYS) seed([name, USER, "some-filter", 2019]);

    invalidateMomentCaches(qc, USER);

    for (const name of MOMENT_DRILLDOWN_KEYS) {
      expect(
        isInvalidated([name, USER, "some-filter", 2019]),
        `${name} should be invalidated`
      ).toBe(true);
    }
  });

  it("leaves a same-named drill-down key belonging to a different user alone", () => {
    // Cross-user isolation. The predicate compares queryKey[1] to the userId; if
    // it ever degrades to matching on name only, one user's mutation would
    // stampede every other cached user's drill-downs in the same client.
    seed(["yearMoments", USER, 2019]);
    seed(["yearMoments", OTHER_USER, 2019]);

    invalidateMomentCaches(qc, USER);

    expect(isInvalidated(["yearMoments", USER, 2019])).toBe(true);
    expect(isInvalidated(["yearMoments", OTHER_USER, 2019])).toBe(false);
  });

  it("leaves a same-named screen key belonging to a different user alone", () => {
    seed(["browseMeta", USER]);
    seed(["browseMeta", OTHER_USER]);

    invalidateMomentCaches(qc, USER);

    expect(isInvalidated(["browseMeta", USER])).toBe(true);
    expect(isInvalidated(["browseMeta", OTHER_USER])).toBe(false);
  });

  it("does not invalidate a query whose name is not in either list", () => {
    seed(["collectionsScreen", USER]);
    seed(["somethingElse", USER, "x"]);

    invalidateMomentCaches(qc, USER);

    expect(isInvalidated(["collectionsScreen", USER])).toBe(false);
    expect(isInvalidated(["somethingElse", USER, "x"])).toBe(false);
  });

  it("is a no-op when userId is undefined", () => {
    for (const name of MOMENT_SCREEN_KEYS) seed([name, USER]);
    seed(["yearMoments", USER, 2019]);
    // A signed-out or mid-restore client has no user id; invalidating everything
    // there would blow away the cache the next user is about to inherit.
    seed([undefined, undefined]);

    invalidateMomentCaches(qc, undefined);

    for (const name of MOMENT_SCREEN_KEYS) {
      expect(isInvalidated([name, USER])).toBe(false);
    }
    expect(isInvalidated(["yearMoments", USER, 2019])).toBe(false);
    expect(isInvalidated([undefined, undefined])).toBe(false);
  });
});

describe("invalidateAlbumCaches", () => {
  it("invalidates the albums tab and its badge", () => {
    seed(["collectionsScreen", USER]);
    seed(["collectionsBadge", USER]);

    invalidateAlbumCaches(qc, USER);

    expect(isInvalidated(["collectionsScreen", USER])).toBe(true);
    expect(isInvalidated(["collectionsBadge", USER])).toBe(true);
  });

  it("invalidates the album detail key only when an albumId is supplied", () => {
    seed(["album", "album-1", USER]);

    invalidateAlbumCaches(qc, USER);
    expect(isInvalidated(["album", "album-1", USER])).toBe(false);

    invalidateAlbumCaches(qc, USER, "album-1");
    expect(isInvalidated(["album", "album-1", USER])).toBe(true);
  });

  it("does not invalidate a different album's detail key", () => {
    seed(["album", "album-1", USER]);
    seed(["album", "album-2", USER]);

    invalidateAlbumCaches(qc, USER, "album-1");

    expect(isInvalidated(["album", "album-1", USER])).toBe(true);
    expect(isInvalidated(["album", "album-2", USER])).toBe(false);
  });

  it("does not invalidate the same album for a different user", () => {
    seed(["album", "album-1", USER]);
    seed(["album", "album-1", OTHER_USER]);

    invalidateAlbumCaches(qc, USER, "album-1");

    expect(isInvalidated(["album", "album-1", USER])).toBe(true);
    expect(isInvalidated(["album", "album-1", OTHER_USER])).toBe(false);
  });

  it("does not touch moment caches", () => {
    // The two helpers are called together at most mutation sites, but they are
    // separate on purpose — an album rename must not invalidate browse metadata.
    seed(["browseMeta", USER]);
    seed(["yearMoments", USER, 2019]);

    invalidateAlbumCaches(qc, USER, "album-1");

    expect(isInvalidated(["browseMeta", USER])).toBe(false);
    expect(isInvalidated(["yearMoments", USER, 2019])).toBe(false);
  });

  it("is a no-op when userId is undefined", () => {
    seed(["collectionsScreen", USER]);
    seed(["collectionsBadge", USER]);
    seed(["album", "album-1", USER]);

    invalidateAlbumCaches(qc, undefined, "album-1");

    expect(isInvalidated(["collectionsScreen", USER])).toBe(false);
    expect(isInvalidated(["collectionsBadge", USER])).toBe(false);
    expect(isInvalidated(["album", "album-1", USER])).toBe(false);
  });
});
