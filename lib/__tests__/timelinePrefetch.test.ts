/**
 * lib/timelinePrefetch.ts keeps its state in two module-level singletons
 * (`_prefetch` and `_network`) that are deliberately not exported — the
 * consume-once contract is the whole point of the module. So every test resets
 * the module registry and re-imports, rather than reaching for a reset helper
 * that production code would never call.
 *
 * The headline case is the regression fixed in 1cd8439: with a warm disk cache
 * the prefetch resolved from cache and the network result was fetched and then
 * silently dropped, so every launch's first paint showed the server state as of
 * the *previous* launch. A moment created last session was simply missing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabaseMock";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";
import type { Moment } from "@/types";

const sb = createSupabaseMock();
const storage = createAsyncStorageMock();

// Both of these transitively import react-native, which vitest can't parse.
// The factories run lazily on first import of the mocked module — after this
// file's own imports have evaluated — so referencing `sb`/`storage` is safe.
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
  ...storage,
}));

const USER = "user-aaa";
const OTHER_USER = "user-bbb";
const CACHE_KEY = `timeline_cache_v2_${USER}`;
const LEGACY_CACHE_KEY = `timeline_cache_v1_${USER}`;

/** A Moment as a previous launch wrote it to the disk cache. */
function cachedMoment(id: string, songTitle: string) {
  return { id, songTitle, moods: [], photoUrls: [], photoThumbnails: [] };
}

/** A `moments` row as the DB returns it, restricted to MOMENT_CARD_COLUMNS. */
function row(id: string, title: string) {
  return {
    id,
    moment_date: "2026-07-01",
    created_at: "2026-07-01T12:00:00Z",
    song_title: title,
    song_artist: "Artist",
    song_album_name: "Album",
    song_artwork_url: "https://example.com/art.jpg",
    song_provider: "apple_music",
    song_apple_music_id: "1",
    song_spotify_id: null,
    song_preview_url: null,
    mood: null,
    photo_urls: [],
    photo_thumbnails: [],
    reflection_text: "text",
    guest_name: null,
    guest_uuid: null,
  };
}

type PrefetchModule = typeof import("../timelinePrefetch");

async function loadModule(): Promise<PrefetchModule> {
  return import("../timelinePrefetch");
}

/** Flush pending microtasks so fire-and-forget work (writeCache) has landed. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  sb.reset();
  storage.reset();
});

describe("prefetchTimeline — warm cache (the shipped regression)", () => {
  it("resolves from cache while still handing the network result to the caller", async () => {
    // Disk holds last launch's state; the server has a moment created since.
    storage.seed(CACHE_KEY, JSON.stringify([cachedMoment("cached", "From Disk")]));
    sb.queueData([row("fresh-1", "From Network"), row("fresh-2", "Also New")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    const fromCache = await mod.consumePrefetchPromise(USER);
    expect(fromCache).toEqual([cachedMoment("cached", "From Disk")]);

    // THE REGRESSION: before the fix this returned nothing and the authoritative
    // first page was discarded, leaving the UI showing `fromCache` forever (the
    // 30s focus cooldown suppressed the refetch that would have corrected it).
    const networkPromise = mod.consumePrefetchNetworkPromise(USER);
    expect(networkPromise).not.toBeNull();

    const fromNetwork = await networkPromise!;
    expect(fromNetwork).toHaveLength(2);
    expect(fromNetwork!.map((m) => m.songTitle)).toEqual(["From Network", "Also New"]);
  });

  it("writes the network result back to the cache even though it rendered from cache", async () => {
    storage.seed(CACHE_KEY, JSON.stringify([cachedMoment("cached", "From Disk")]));
    sb.queueData([row("fresh-1", "From Network")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await mod.consumePrefetchPromise(USER);
    await mod.consumePrefetchNetworkPromise(USER);

    const written = JSON.parse(storage.map.get(CACHE_KEY)!);
    expect(written).toHaveLength(1);
    expect(written[0].songTitle).toBe("From Network");
  });

  it("issues the timeline query with the expected filter chain", async () => {
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await mod.consumePrefetchPromise(USER);

    expect(sb.queries).toHaveLength(1);
    expect(sb.queries[0].table).toBe("moments");
    // Two .order() calls: moment_date then created_at. Losing the second makes
    // same-day moments order non-deterministically across pages.
    expect(sb.queries[0].chain.map((c) => c.method)).toEqual([
      "select",
      "eq",
      "order",
      "order",
      "range",
    ]);
    expect(sb.queries[0].chain[1].args).toEqual(["user_id", USER]);
    expect(sb.queries[0].chain[4].args).toEqual([0, mod.TIMELINE_PAGE_SIZE - 1]);
  });
});

describe("prefetchTimeline — cold cache", () => {
  it("resolves from the network when there is no cache", async () => {
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    const result = await mod.consumePrefetchPromise(USER);
    expect(result).toHaveLength(1);
    expect(result![0].songTitle).toBe("A");
  });

  it("falls through to the network when the cache holds an empty array", async () => {
    // A cached [] is not a usable first paint — it's indistinguishable from
    // "user has no moments", so the module deliberately waits for the network.
    storage.seed(CACHE_KEY, JSON.stringify([]));
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    const result = await mod.consumePrefetchPromise(USER);
    expect(result).toHaveLength(1);
  });

  it("resolves null — not [] — when the network fails with no cache", async () => {
    // The distinction is load-bearing: [] paints an empty timeline with the
    // "capture your first moment" empty state, telling an offline user with
    // years of moments that they have none. null means "unknown, keep what you
    // have / show an error".
    sb.queueError({ message: "network request failed" });

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    const result = await mod.consumePrefetchPromise(USER);
    expect(result).toBeNull();
    expect(result).not.toEqual([]);
  });

  it("does not poison the cache when the network fails", async () => {
    sb.queueError({ message: "network request failed" });

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await mod.consumePrefetchPromise(USER);

    expect(storage.map.has(CACHE_KEY)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("resolves [] for a user who genuinely has no moments", async () => {
    sb.queueData([]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    expect(await mod.consumePrefetchPromise(USER)).toEqual([]);
  });
});

describe("consume-once + cross-user guards", () => {
  it("returns null when consumed for a different user", async () => {
    storage.seed(CACHE_KEY, JSON.stringify([cachedMoment("cached", "C")]));
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    // Account switch: serving user A's timeline to user B is a data leak, not a
    // stale render.
    expect(mod.consumePrefetchPromise(OTHER_USER)).toBeNull();
    expect(mod.consumePrefetchNetworkPromise(OTHER_USER)).toBeNull();
    // …and the rightful owner's promise is untouched.
    expect(mod.consumePrefetchPromise(USER)).not.toBeNull();
  });

  it("returns null on a second consume of the same promise", async () => {
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    expect(mod.consumePrefetchPromise(USER)).not.toBeNull();
    expect(mod.consumePrefetchPromise(USER)).toBeNull();

    expect(mod.consumePrefetchNetworkPromise(USER)).not.toBeNull();
    expect(mod.consumePrefetchNetworkPromise(USER)).toBeNull();
  });

  it("returns null when nothing was ever prefetched", async () => {
    const mod = await loadModule();

    expect(mod.consumePrefetchPromise(USER)).toBeNull();
    expect(mod.consumePrefetchNetworkPromise(USER)).toBeNull();
  });

  it("does not fire a second network request when prefetched twice for the same user", async () => {
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    mod.prefetchTimeline(USER);

    expect(sb.client.from).toHaveBeenCalledTimes(1);
    expect(sb.queries).toHaveLength(1);

    await mod.consumePrefetchPromise(USER);
  });

  it("starts a fresh prefetch for a different user", async () => {
    sb.queueData([row("a", "A")]);
    sb.queueData([row("b", "B")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    mod.prefetchTimeline(OTHER_USER);

    expect(sb.queries).toHaveLength(2);
    expect(sb.queries[1].chain[1].args).toEqual(["user_id", OTHER_USER]);
  });
});

describe("clearTimelineCache", () => {
  it("drops both singletons and the AsyncStorage key", async () => {
    storage.seed(CACHE_KEY, JSON.stringify([cachedMoment("cached", "C")]));
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await settle(); // let the launch fetch finish before signing out

    await mod.clearTimelineCache(USER);

    expect(mod.consumePrefetchPromise(USER)).toBeNull();
    expect(mod.consumePrefetchNetworkPromise(USER)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(CACHE_KEY);
    expect(storage.map.has(CACHE_KEY)).toBe(false);
  });

  it("an in-flight fetch does not rewrite the cache it just cleared", async () => {
    // The fetch can't be aborted once issued, so it is superseded instead: a
    // generation counter is bumped by clearTimelineCache, and the fetch checks
    // it before writing. Without that, signing out (or deleting an account)
    // while the launch prefetch was in flight put that user's moments straight
    // back on disk — clearTimelineCache looked like a guarantee and wasn't.
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await mod.clearTimelineCache(USER); // clears while the fetch is in flight
    await settle();

    expect(storage.removeItem).toHaveBeenCalledWith(CACHE_KEY);
    expect(storage.map.has(CACHE_KEY)).toBe(false);
  });

  it("a later prefetch for the same user still writes the cache", async () => {
    // Guards against over-correcting: the generation check must only suppress
    // superseded fetches, not permanently disable caching after a sign-out.
    sb.queueData([row("a", "A")]);
    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await mod.clearTimelineCache(USER);
    await settle();

    sb.queueData([row("b", "B")]);
    mod.prefetchTimeline(USER);
    await settle();

    expect(storage.map.has(CACHE_KEY)).toBe(true);
  });

  it("leaves another user's prefetch in place", async () => {
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await mod.clearTimelineCache(OTHER_USER);

    expect(mod.consumePrefetchPromise(USER)).not.toBeNull();
  });
});

describe("disk cache shape (pre-multi-mood caches)", () => {
  it("ignores a v1 cache and removes it, falling through to the network", async () => {
    // Written before the multi-mood change: `mood`, no `moods`. Rendering it
    // made MomentCard call moods.slice on undefined on first paint.
    storage.seed(
      LEGACY_CACHE_KEY,
      JSON.stringify([{ id: "old", songTitle: "Old", mood: "happy", photoUrls: [] }])
    );
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    const result = await mod.consumePrefetchPromise(USER);
    expect(result!.map((m) => m.id)).toEqual(["a"]);
    await settle();
    expect(storage.map.has(LEGACY_CACHE_KEY)).toBe(false);
  });

  it("treats a cache row without moods as a miss rather than rendering it", async () => {
    storage.seed(
      CACHE_KEY,
      JSON.stringify([cachedMoment("ok", "Ok"), { id: "bad", songTitle: "Bad", photoUrls: [] }])
    );
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    const result = await mod.consumePrefetchPromise(USER);
    expect(result!.map((m) => m.id)).toEqual(["a"]);
  });

  it("returns null for anything that isn't an array of moments", async () => {
    const mod = await loadModule();
    expect(mod.parseCachedTimeline(null)).toBeNull();
    expect(mod.parseCachedTimeline("not json")).toBeNull();
    expect(mod.parseCachedTimeline(JSON.stringify({ id: "x" }))).toBeNull();
    expect(mod.parseCachedTimeline(JSON.stringify([null]))).toBeNull();
    expect(mod.parseCachedTimeline(JSON.stringify([cachedMoment("x", "X")]))).toEqual([
      cachedMoment("x", "X"),
    ]);
  });

  it("clearTimelineCache also removes the legacy key", async () => {
    storage.seed(LEGACY_CACHE_KEY, "[]");
    const mod = await loadModule();
    await mod.clearTimelineCache(USER);
    expect(storage.map.has(LEGACY_CACHE_KEY)).toBe(false);
  });
});

describe("mergeFirstPage (background refresh keeps loaded pages)", () => {
  const PAGE = 3;
  // Newest first.
  function m(id: string, momentDate: string | null, createdAt = "2026-01-01T00:00:00Z") {
    return { id, momentDate, createdAt } as Moment;
  }
  const loaded = [
    m("a", "2026-10-09"),
    m("b", "2026-10-08"),
    m("c", "2026-10-07"),
    m("d", "2026-10-06"),
    m("e", "2026-10-05"),
    m("f", null),
  ];

  it("keeps the already-loaded tail instead of collapsing to one page", async () => {
    const mod = await loadModule();
    const fresh = [m("a", "2026-10-09"), m("b", "2026-10-08"), m("c", "2026-10-07")];
    const out = mod.mergeFirstPage(loaded, fresh, true, PAGE);
    expect(out.moments.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(out.hasMore).toBe(true);
  });

  it("prepends a new moment and keeps the row it pushed off page 0", async () => {
    const mod = await loadModule();
    const fresh = [m("new", "2026-10-10"), m("a", "2026-10-09"), m("b", "2026-10-08")];
    const out = mod.mergeFirstPage(loaded, fresh, false, PAGE);
    expect(out.moments.map((x) => x.id)).toEqual(["new", "a", "b", "c", "d", "e", "f"]);
    expect(out.hasMore).toBe(false);
  });

  it("drops a row deleted from inside the first page", async () => {
    const mod = await loadModule();
    const fresh = [m("a", "2026-10-09"), m("c", "2026-10-07"), m("d", "2026-10-06")];
    const out = mod.mergeFirstPage(loaded, fresh, true, PAGE);
    expect(out.moments.map((x) => x.id)).toEqual(["a", "c", "d", "e", "f"]);
  });

  it("treats a short first page as the whole timeline", async () => {
    const mod = await loadModule();
    const out = mod.mergeFirstPage(loaded, [m("a", "2026-10-09")], true, PAGE);
    expect(out.moments.map((x) => x.id)).toEqual(["a"]);
    expect(out.hasMore).toBe(false);
  });

  it("replaces a list that only had the first page", async () => {
    const mod = await loadModule();
    const fresh = [m("x", "2026-10-09"), m("y", "2026-10-08"), m("z", "2026-10-07")];
    const out = mod.mergeFirstPage(loaded.slice(0, 3), fresh, false, PAGE);
    expect(out.moments.map((x) => x.id)).toEqual(["x", "y", "z"]);
    expect(out.hasMore).toBe(true);
  });

  it("orders undated moments last and same-day moments by created_at", async () => {
    const mod = await loadModule();
    expect(mod.compareTimelineOrder(m("u", null), m("d", "2020-01-01"))).toBeGreaterThan(0);
    expect(
      mod.compareTimelineOrder(
        m("late", "2026-10-01", "2026-10-01T20:00:00Z"),
        m("early", "2026-10-01", "2026-10-01T08:00:00Z")
      )
    ).toBeLessThan(0);
  });

  it("appendPage skips ids already shown", async () => {
    const mod = await loadModule();
    const out = mod.appendPage(loaded.slice(0, 3), [m("c", "2026-10-07"), m("d", "2026-10-06")]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("lastLoadedPage rounds down so load-more never skips rows", async () => {
    const mod = await loadModule();
    expect(mod.lastLoadedPage(0, 30)).toBe(0);
    expect(mod.lastLoadedPage(30, 30)).toBe(0);
    expect(mod.lastLoadedPage(91, 30)).toBe(2);
    expect(mod.lastLoadedPage(89, 30)).toBe(1);
  });
});

describe("discardTimelinePrefetch — data changed after the prefetch fired", () => {
  it("drops both legs so no later consumer can use the outdated result", async () => {
    // New-user onboarding: the prefetch ran at sign-up, before any moments.
    sb.queueData([]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    mod.discardTimelinePrefetch(USER);

    expect(mod.consumePrefetchPromise(USER)).toBeNull();
    expect(mod.consumePrefetchNetworkPromise(USER)).toBeNull();
  });

  it("leaves another user's prefetch alone", async () => {
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    mod.discardTimelinePrefetch(OTHER_USER);

    expect(mod.consumePrefetchPromise(USER)).not.toBeNull();
    expect(mod.consumePrefetchNetworkPromise(USER)).not.toBeNull();
  });
});

describe("prefetch age (B2: an old prefetch painted over newer rows)", () => {
  // hydrateUser re-runs on auth events while the profile load is failing and
  // fired a prefetch nobody consumed. A later Journal remount (share intent:
  // replace("/create") then replace("/(tabs)")) painted that old first page.

  it("isPrefetchFresh: young and not older than the last local change", async () => {
    const mod = await loadModule();
    const max = mod.PREFETCH_MAX_AGE_MS;
    expect(mod.isPrefetchFresh(1_000, 1_000 + max, 0)).toBe(true);
    expect(mod.isPrefetchFresh(1_000, 1_000 + max + 1, 0)).toBe(false);
    expect(mod.isPrefetchFresh(1_000, 2_000, 1_000)).toBe(true);
    expect(mod.isPrefetchFresh(1_000, 2_000, 1_500)).toBe(false);
  });

  it("discards a prefetch older than the max age instead of handing it over", async () => {
    storage.seed(CACHE_KEY, JSON.stringify([cachedMoment("cached", "C")]));
    sb.queueData([row("a", "A")]);

    const mod = await loadModule();
    const start = Date.now();
    mod.prefetchTimeline(USER, start);
    const later = start + mod.PREFETCH_MAX_AGE_MS + 1;

    expect(mod.consumePrefetchPromise(USER, later)).toBeNull();
    // Both legs went, so no later consumer can pick either up.
    expect(mod.consumePrefetchNetworkPromise(USER, start)).toBeNull();
    expect(mod.consumePrefetchPromise(USER, start)).toBeNull();
  });

  it("hands over a prefetch inside the max age", async () => {
    sb.queueData([row("a", "A")]);
    const mod = await loadModule();
    const start = Date.now();
    mod.prefetchTimeline(USER, start);
    expect(mod.consumePrefetchPromise(USER, start + mod.PREFETCH_MAX_AGE_MS)).not.toBeNull();
  });

  it("discards a prefetch that started before the last markTimelineStale", async () => {
    sb.queueData([row("a", "A")]);
    const mod = await loadModule();
    // Same module registry as timelinePrefetch's own import.
    const refresh = await import("../timelineRefresh");
    mod.prefetchTimeline(USER, Date.now() - 1_000);
    refresh.markTimelineStale();

    expect(mod.consumePrefetchPromise(USER)).toBeNull();
    expect(mod.consumePrefetchNetworkPromise(USER)).toBeNull();
  });

  it("discards a prefetch that started before the last markTimelineDeleted", async () => {
    sb.queueData([row("a", "A")]);
    const mod = await loadModule();
    const refresh = await import("../timelineRefresh");
    mod.prefetchTimeline(USER, Date.now() - 1_000);
    refresh.markTimelineDeleted("a");

    expect(mod.consumePrefetchPromise(USER)).toBeNull();
  });

  it("does not prefetch again for a user whose timeline already took the prefetch", async () => {
    sb.queueData([row("a", "A")]);
    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await mod.consumePrefetchPromise(USER);

    mod.prefetchTimeline(USER); // hydrateUser re-run on a later auth event
    expect(sb.queries).toHaveLength(1);
    expect(mod.consumePrefetchPromise(USER)).toBeNull();
  });

  it("does not prefetch again once the timeline has written the cache", async () => {
    const mod = await loadModule();
    mod.writeTimelineCache(USER, []);
    mod.prefetchTimeline(USER);
    expect(sb.queries).toHaveLength(0);
  });

  it("prefetches again after sign-out cleared the timeline", async () => {
    sb.queueData([row("a", "A")]);
    sb.queueData([row("b", "B")]);
    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    await mod.consumePrefetchPromise(USER);
    await mod.clearTimelineCache(USER);

    mod.prefetchTimeline(USER);
    expect(sb.queries).toHaveLength(2);
  });

  it("replaces an outdated in-flight prefetch instead of keeping it", async () => {
    sb.queueData([row("old", "Old")]);
    sb.queueData([row("new", "New")]);
    const mod = await loadModule();
    const start = Date.now() - mod.PREFETCH_MAX_AGE_MS - 1;
    mod.prefetchTimeline(USER, start);
    mod.prefetchTimeline(USER);

    expect(sb.queries).toHaveLength(2);
    const result = await mod.consumePrefetchPromise(USER);
    expect(result!.map((m) => m.id)).toEqual(["new"]);
  });

  it("a discarded prefetch does not write its page to the cache", async () => {
    sb.queueData([row("old", "Old")]);
    const mod = await loadModule();
    mod.prefetchTimeline(USER);
    mod.discardTimelinePrefetch(USER); // still in flight
    await settle();
    expect(storage.map.has(CACHE_KEY)).toBe(false);
  });
});

describe("writeTimelineCache (B4: the disk cache was only written at launch)", () => {
  function moment(id: string) {
    return {
      ...cachedMoment(id, id),
      momentDate: "2026-01-01",
      createdAt: "2026-01-01T00:00:00Z",
    } as unknown as Moment;
  }

  it("writes the first page only", async () => {
    const mod = await loadModule();
    const list = Array.from({ length: mod.TIMELINE_PAGE_SIZE + 5 }, (_, i) => moment(`m${i}`));
    mod.writeTimelineCache(USER, list, mod.getTimelineCacheGeneration());
    await settle();
    const written = JSON.parse(storage.map.get(CACHE_KEY)!);
    expect(written).toHaveLength(mod.TIMELINE_PAGE_SIZE);
    expect(written[0].id).toBe("m0");
    // What was written reads back as a valid cache.
    expect(mod.parseCachedTimeline(storage.map.get(CACHE_KEY)!)).not.toBeNull();
  });

  it("does not resurrect the cache when sign-out cleared it after the fetch started", async () => {
    const mod = await loadModule();
    const generation = mod.getTimelineCacheGeneration(); // fetch starts
    await mod.clearTimelineCache(USER); // sign-out while it's in flight
    mod.writeTimelineCache(USER, [moment("a")], generation); // fetch lands
    await settle();
    expect(storage.map.has(CACHE_KEY)).toBe(false);
  });

  it("writes when nothing superseded the fetch", async () => {
    const mod = await loadModule();
    await mod.clearTimelineCache(USER);
    const generation = mod.getTimelineCacheGeneration();
    mod.writeTimelineCache(USER, [moment("a")], generation);
    await settle();
    expect(JSON.parse(storage.map.get(CACHE_KEY)!)[0].id).toBe("a");
  });
});

describe("insertPendingMoment (B7: a saved moment was always prepended)", () => {
  function m(id: string, momentDate: string | null, createdAt = "2026-01-01T00:00:00Z") {
    return { id, momentDate, createdAt } as Moment;
  }
  const list = [m("a", "2026-10-09"), m("b", "2026-08-15"), m("c", "2026-06-01")];

  it("puts a new moment for today at the top", async () => {
    const mod = await loadModule();
    const out = mod.insertPendingMoment(list, m("new", "2026-11-15"), false);
    expect(out.map((x) => x.id)).toEqual(["new", "a", "b", "c"]);
  });

  it("puts a backdated moment in its month, not at the top", async () => {
    const mod = await loadModule();
    const out = mod.insertPendingMoment(list, m("new", "2026-08-20"), false);
    expect(out.map((x) => x.id)).toEqual(["a", "new", "b", "c"]);
  });

  it("orders same-day moments by created_at", async () => {
    const mod = await loadModule();
    const out = mod.insertPendingMoment(list, m("new", "2026-08-15", "2025-12-31T00:00:00Z"), false);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "new", "c"]);
  });

  it("does not duplicate a moment the refresh already brought in", async () => {
    const mod = await loadModule();
    const out = mod.insertPendingMoment(list, m("b", "2026-08-15"), false);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("moves an edited moment whose date changed", async () => {
    const mod = await loadModule();
    const out = mod.insertPendingMoment(list, m("a", "2026-07-01"), false);
    expect(out.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("appends an older moment when the whole timeline is loaded", async () => {
    const mod = await loadModule();
    const out = mod.insertPendingMoment(list, m("old", "2019-01-01"), false);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c", "old"]);
  });

  it("leaves an older moment to load-more when more pages exist", async () => {
    const mod = await loadModule();
    const out = mod.insertPendingMoment(list, m("old", "2019-01-01"), true);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("handles an empty list and undated moments", async () => {
    const mod = await loadModule();
    expect(mod.insertPendingMoment([], m("x", null), false).map((x) => x.id)).toEqual(["x"]);
    const out = mod.insertPendingMoment(list, m("undated", null), false);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c", "undated"]);
  });
});
