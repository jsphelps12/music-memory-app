/**
 * The outbox holds moments that haven't saved yet, so losing or doubling one
 * is the worst it can do. These cover the rules (pure: dedupe, backoff and
 * when an item is due, rejected items, what's kept of a save) and the storage
 * layer against an in-memory AsyncStorage, with the file side stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";
import type { Song } from "@/types";
import type { SaveMomentInput } from "../saveMoment";

const storage = createAsyncStorageMock();
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage, ...storage }));

let uuid = 0;
vi.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++uuid}` }));

// The file side (expo-file-system) is native glue: a stand-in that "copies"
// each local file into the item's folder, the way the real one does.
const files = vi.hoisted(() => ({
  keepOutboxFiles: vi.fn(async (userId: string, itemId: string, uris: string[]) =>
    Object.fromEntries(uris.map((u) => [u, `doc:capture-outbox/${userId}/${itemId}/${u.split("/").pop()}`]))
  ),
  liveOutboxUri: vi.fn((stored: string) => stored.replace(/^doc:/, "file:///docs/")),
  deleteOutboxFiles: vi.fn(),
  deleteAllOutboxFiles: vi.fn(),
  pruneOutboxFiles: vi.fn(),
}));
vi.mock("../outboxFiles", () => files);

const {
  RETRY_DELAYS_MS,
  GIVE_UP_AFTER,
  OFFLINE_RETRY_MS,
  afterFailure,
  afterRetryAsked,
  dueAt,
  isDue,
  nextToTry,
  nextWakeAt,
  outboxForDisplay,
  outboxFileUris,
  retryDelayMs,
  toOutboxInput,
  fromOutboxInput,
  withQueued,
  withoutItem,
  parseStoredOutbox,
  enqueueOutbox,
  listOutbox,
  outboxCount,
  recordOutboxFailure,
  removeOutboxItem,
  retryOutboxItem,
  clearOutbox,
  subscribeOutbox,
  outboxSaveInput,
  outboxKey,
} = await import("../outbox");
type OutboxItem = import("../outbox").OutboxItem;

const song: Song = {
  id: "1",
  title: "Lovely Day",
  artistName: "Bill Withers",
  albumName: "Menagerie",
  artworkUrl: "https://is1-ssl.mzstatic.com/x/600x600bb.jpg",
  provider: "apple_music",
  appleMusicId: "1",
  spotifyId: null,
  durationMs: 0,
};

const save = (over: Partial<SaveMomentInput> = {}): SaveMomentInput => ({
  userId: "u1",
  song,
  reflection: "the drive home",
  moods: ["happy"],
  people: [],
  locationResult: null,
  momentDate: new Date(2026, 10, 20, 9, 30),
  photos: [],
  ...over,
});

const item = (over: Partial<OutboxItem> = {}): OutboxItem => ({
  id: "m1",
  userId: "u1",
  queuedAt: 1_000,
  attempts: 0,
  lastAttemptAt: null,
  input: toOutboxInput(save()),
  ...over,
});

const T0 = 1_000_000;

describe("what the outbox keeps of a save", () => {
  it("drops the preview promise and the id, and keeps the date as epoch ms", () => {
    const input = toOutboxInput(
      save({ prefetchedPreview: Promise.resolve(null), momentId: "x", weatherResult: { tempF: 50, condition: "Rain" } })
    );
    expect(input).not.toHaveProperty("prefetchedPreview");
    expect(input).not.toHaveProperty("momentId");
    expect(input.momentDate).toBe(new Date(2026, 10, 20, 9, 30).getTime());
    expect(input.weatherResult).toEqual({ tempF: 50, condition: "Rain" });
  });

  it("comes back as the same save, under the item's id, with the local date intact", () => {
    const original = save({ selectedAlbum: null, captureSource: "search", peopleLinks: [{ name: "Sam", friendId: "f1" }] });
    const back = fromOutboxInput(item({ id: "m9", input: toOutboxInput(original) }));
    expect(back.momentId).toBe("m9");
    expect(back.momentDate).toBeInstanceOf(Date);
    expect(back.momentDate!.getDate()).toBe(20);
    expect(back.momentDate!.getHours()).toBe(9);
    const { momentId: _id, ...rest } = back;
    void _id;
    expect(rest).toEqual(original);
  });

  it("keeps \"No specific date\" as null", () => {
    expect(fromOutboxInput(item({ input: toOutboxInput(save({ momentDate: null })) })).momentDate).toBeNull();
  });

  it("round-trips fields it doesn't know about (a voice recording added later)", () => {
    const withVoice = { ...save(), voiceUri: "file:///tmp/voice.m4a", voiceDurationMs: 4200, extra: { nested: [1, 2] } };
    const input = toOutboxInput(withVoice as SaveMomentInput);
    const stored = parseStoredOutbox(JSON.stringify([item({ input })]))[0];
    const back = fromOutboxInput(stored) as unknown as Record<string, unknown>;
    expect(back.voiceUri).toBe("file:///tmp/voice.m4a");
    expect(back.voiceDurationMs).toBe(4200);
    expect(back.extra).toEqual({ nested: [1, 2] });
  });

  it("lists the local files to keep: photos and the voice recording, not remote or Photos URLs", () => {
    const input = {
      ...toOutboxInput(save({ photos: ["file:///a.jpg", "https://x/b.jpg", "ph://ABC", "/var/c.jpg", "file:///a.jpg"] })),
      voiceUri: "file:///v.m4a",
    };
    expect(outboxFileUris(input)).toEqual(["file:///a.jpg", "/var/c.jpg", "file:///v.m4a"]);
  });
});

describe("queueing", () => {
  it("adds a new item at the end", () => {
    const list = withQueued([item({ id: "a" })], item({ id: "b", queuedAt: 2_000 }));
    expect(list.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("never holds the same moment twice: queueing it again replaces it, keeping when it was queued", () => {
    const list = withQueued(
      [item({ id: "a", queuedAt: 1 }), item({ id: "b", queuedAt: 2 })],
      item({ id: "a", queuedAt: 99, input: toOutboxInput(save({ reflection: "edited" })) })
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: "a", queuedAt: 1 });
    expect(list[0].input.reflection).toBe("edited");
  });

  it("removes by id", () => {
    expect(withoutItem([item({ id: "a" }), item({ id: "b" })], "a").map((i) => i.id)).toEqual(["b"]);
  });

  it("shows newest first", () => {
    const list = [item({ id: "old", queuedAt: 1 }), item({ id: "new", queuedAt: 3 }), item({ id: "mid", queuedAt: 2 })];
    expect(outboxForDisplay(list).map((i) => i.id)).toEqual(["new", "mid", "old"]);
  });
});

describe("backoff and when an item is due", () => {
  it("waits 30 s, 2 min, 10 min, then an hour at most", () => {
    expect([1, 2, 3, 4, 5, 20].map(retryDelayMs)).toEqual([
      RETRY_DELAYS_MS[0],
      RETRY_DELAYS_MS[1],
      RETRY_DELAYS_MS[2],
      RETRY_DELAYS_MS[3],
      60 * 60_000,
      60 * 60_000,
    ]);
    expect(RETRY_DELAYS_MS).toEqual([30_000, 120_000, 600_000, 3_600_000]);
  });

  it("a fresh item is due at once", () => {
    expect(isDue(item({ queuedAt: T0 }), T0)).toBe(true);
  });

  it("after a server failure it waits out the backoff", () => {
    const failed = afterFailure(item(), { kind: "server" }, T0);
    expect(failed.attempts).toBe(1);
    expect(isDue(failed, T0 + 29_999)).toBe(false);
    expect(isDue(failed, T0 + 30_000)).toBe(true);
    const twice = afterFailure(failed, { kind: "server" }, T0 + 30_000);
    expect(dueAt(twice)).toBe(T0 + 30_000 + 120_000);
  });

  it("an offline failure doesn't count toward giving up and is due again whenever a flush runs", () => {
    let it_ = item();
    for (let i = 0; i < GIVE_UP_AFTER * 2; i++) it_ = afterFailure(it_, { kind: "offline" }, T0);
    expect(it_.attempts).toBe(0);
    expect(it_.lastErrorKind).toBe("offline");
    expect(isDue(it_, T0)).toBe(true);
  });

  it("gives up after GIVE_UP_AFTER server failures: rejected, never due", () => {
    let it_ = item();
    for (let i = 0; i < GIVE_UP_AFTER - 1; i++) it_ = afterFailure(it_, { kind: "server" }, T0);
    expect(it_.lastErrorKind).toBe("server");
    it_ = afterFailure(it_, { kind: "server", message: "Server is busy." }, T0);
    expect(it_.lastErrorKind).toBe("rejected");
    expect(it_.lastError).toBe("Server is busy.");
    expect(dueAt(it_)).toBeNull();
    expect(isDue(it_, T0 + 10 * 24 * 3_600_000)).toBe(false);
  });

  it("a rejected item is never tried automatically, until the person asks", () => {
    const rejected = afterFailure(item(), { kind: "rejected", message: "You don't have permission to do that." }, T0);
    expect(nextToTry([rejected], T0 + 1e9)).toBeNull();
    const again = afterRetryAsked(rejected);
    expect(again).toMatchObject({ attempts: 0, lastAttemptAt: null });
    expect(again).not.toHaveProperty("lastErrorKind");
    expect(again).not.toHaveProperty("lastError");
    expect(isDue(again, T0)).toBe(true);
  });

  it("picks the oldest due item, skipping ones tried this run and ones waiting", () => {
    const waiting = afterFailure(item({ id: "waiting", queuedAt: 1 }), { kind: "server" }, T0);
    const list = [item({ id: "newer", queuedAt: 3 }), waiting, item({ id: "older", queuedAt: 2 })];
    expect(nextToTry(list, T0)?.id).toBe("older");
    expect(nextToTry(list, T0, new Set(["older"]))?.id).toBe("newer");
    expect(nextToTry(list, T0, new Set(["older", "newer"]))).toBeNull();
    expect(nextToTry(list, T0 + 30_000)?.id).toBe("waiting");
  });

  it("wakes a timer for the soonest backoff, and at most every 30 s for offline failures", () => {
    const server = afterFailure(item({ id: "s" }), { kind: "server" }, T0);
    const offline = afterFailure(item({ id: "o" }), { kind: "offline" }, T0);
    const rejected = afterFailure(item({ id: "r" }), { kind: "rejected" }, T0);
    expect(nextWakeAt([server])).toBe(T0 + 30_000);
    expect(nextWakeAt([offline])).toBe(T0 + OFFLINE_RETRY_MS);
    expect(nextWakeAt([rejected])).toBeNull();
    expect(nextWakeAt([])).toBeNull();
    expect(nextWakeAt([server, item({ id: "fresh", queuedAt: 5 })])).toBe(5);
  });
});

describe("parsing what's stored", () => {
  it("skips entries that don't read right and survives garbage", () => {
    const good = item();
    const raw = JSON.stringify([good, { id: 3 }, null, { ...good, id: "m2", input: { song } }]);
    expect(parseStoredOutbox(raw).map((i) => i.id)).toEqual(["m1"]);
    expect(parseStoredOutbox("not json")).toEqual([]);
    expect(parseStoredOutbox(null)).toEqual([]);
  });
});

describe("storage", () => {
  beforeEach(() => {
    storage.reset();
    uuid = 0;
    for (const fn of Object.values(files)) fn.mockClear();
  });

  it("queues under the id capture picked, copying its photos and voice recording", async () => {
    const queued = await enqueueOutbox(
      "u1",
      { ...save({ momentId: "picked", photos: ["file:///cache/a.jpg"], photoAssetIds: ["asset-1"] }), voiceUri: "file:///cache/v.m4a" } as SaveMomentInput,
      { now: T0 }
    );
    expect(queued.id).toBe("picked");
    expect(files.keepOutboxFiles).toHaveBeenCalledWith("u1", "picked", ["file:///cache/a.jpg", "file:///cache/v.m4a"]);
    expect(queued.input.photos).toEqual(["doc:capture-outbox/u1/picked/a.jpg"]);
    // A library photo keeps its id, as the save expects.
    expect(queued.input.photoAssetIds).toEqual(["asset-1"]);
    expect((queued.input as unknown as Record<string, unknown>).voiceUri).toBe("doc:capture-outbox/u1/picked/v.m4a");
    expect(JSON.parse(storage.map.get(outboxKey("u1"))!)).toHaveLength(1);
  });

  it("picks a new id when capture didn't", async () => {
    const queued = await enqueueOutbox("u1", save(), { now: T0 });
    expect(queued.id).toBe("uuid-1");
  });

  it("records the failure that sent it to the outbox, so the backoff starts from it", async () => {
    const queued = await enqueueOutbox("u1", save(), { now: T0, failure: { kind: "server", message: "x" } });
    expect(queued).toMatchObject({ attempts: 1, lastAttemptAt: T0, lastErrorKind: "server" });
  });

  it("queueing the same moment twice keeps one", async () => {
    await enqueueOutbox("u1", save({ momentId: "m1" }), { now: T0 });
    await enqueueOutbox("u1", save({ momentId: "m1", reflection: "again" }), { now: T0 + 5 });
    const list = await listOutbox("u1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ queuedAt: T0, input: { reflection: "again" } });
  });

  it("keeps each user's outbox apart", async () => {
    await enqueueOutbox("u1", save({ momentId: "a" }));
    await enqueueOutbox("u2", save({ momentId: "b", userId: "u2" }));
    expect((await listOutbox("u1")).map((i) => i.id)).toEqual(["a"]);
    expect(await outboxCount("u2")).toBe(1);
  });

  it("runs storage operations one at a time, so concurrent changes all land", async () => {
    await Promise.all([
      enqueueOutbox("u1", save({ momentId: "a" }), { now: 1 }),
      enqueueOutbox("u1", save({ momentId: "b" }), { now: 2 }),
      enqueueOutbox("u1", save({ momentId: "c" }), { now: 3 }),
      recordOutboxFailure("u1", "a", { kind: "offline" }, 10),
    ]);
    const list = await listOutbox("u1");
    expect(list.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(list[0].lastErrorKind).toBe("offline");
  });

  it("removing deletes the item and its kept files", async () => {
    await enqueueOutbox("u1", save({ momentId: "a" }));
    await removeOutboxItem("u1", "a");
    expect(await outboxCount("u1")).toBe(0);
    expect(storage.map.has(outboxKey("u1"))).toBe(false);
    expect(files.deleteOutboxFiles).toHaveBeenCalledWith("u1", "a");
  });

  it("try again resets a rejected item", async () => {
    await enqueueOutbox("u1", save({ momentId: "a" }), { failure: { kind: "rejected" } });
    await retryOutboxItem("u1", "a");
    const [again] = await listOutbox("u1");
    expect(again).toMatchObject({ attempts: 0, lastAttemptAt: null });
    expect(again.lastErrorKind).toBeUndefined();
  });

  it("clearing takes every item and the user's kept files", async () => {
    await enqueueOutbox("u1", save({ momentId: "a" }));
    await clearOutbox("u1");
    expect(await outboxCount("u1")).toBe(0);
    expect(files.deleteAllOutboxFiles).toHaveBeenCalledWith("u1");
  });

  it("tells listeners which user's outbox changed", async () => {
    const heard: string[] = [];
    const stop = subscribeOutbox((u) => heard.push(u));
    await enqueueOutbox("u1", save({ momentId: "a" }));
    await recordOutboxFailure("u1", "a", { kind: "server" });
    await removeOutboxItem("u1", "a");
    stop();
    await enqueueOutbox("u1", save({ momentId: "b" }));
    expect(heard).toEqual(["u1", "u1", "u1"]);
  });

  it("hands the save its kept files as file URIs in this install", async () => {
    const queued = await enqueueOutbox("u1", save({ momentId: "a", photos: ["file:///cache/a.jpg"] }));
    const input = outboxSaveInput(queued);
    expect(input.photos).toEqual(["file:///docs/capture-outbox/u1/a/a.jpg"]);
    expect(input.momentId).toBe("a");
  });
});
