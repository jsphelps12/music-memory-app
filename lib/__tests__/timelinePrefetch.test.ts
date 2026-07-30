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
const CACHE_KEY = `timeline_cache_v1_${USER}`;

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
    storage.seed(CACHE_KEY, JSON.stringify([{ id: "cached", songTitle: "From Disk" }]));
    sb.queueData([row("fresh-1", "From Network"), row("fresh-2", "Also New")]);

    const mod = await loadModule();
    mod.prefetchTimeline(USER);

    const fromCache = await mod.consumePrefetchPromise(USER);
    expect(fromCache).toEqual([{ id: "cached", songTitle: "From Disk" }]);

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
    storage.seed(CACHE_KEY, JSON.stringify([{ id: "cached", songTitle: "From Disk" }]));
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
    storage.seed(CACHE_KEY, JSON.stringify([{ id: "cached" }]));
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
    storage.seed(CACHE_KEY, JSON.stringify([{ id: "cached" }]));
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
