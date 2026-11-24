/**
 * Saving the outbox: which failures mean "try later", "move on" or "leave it
 * for the person", the order moments save in, and that two flushes never run
 * at once. The save, storage, clock and connection are injected; React
 * Native and the native file side are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";
import type { Song } from "@/types";
import type { SaveMomentInput, SaveMomentResult } from "../saveMoment";

const storage = createAsyncStorageMock();
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage, ...storage }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));
vi.mock("react-native", () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock("@react-native-community/netinfo", () => ({
  default: { fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })), addEventListener: vi.fn(() => () => {}) },
}));
vi.mock("@tanstack/react-query", () => ({ focusManager: {}, onlineManager: {} }));
vi.mock("@sentry/react-native", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock("@/lib/saveMoment", () => ({ saveMoment: vi.fn() }));

const files = vi.hoisted(() => ({
  keepOutboxFiles: vi.fn(async (userId: string, itemId: string, uris: string[]) =>
    Object.fromEntries(uris.map((u) => [u, `doc:capture-outbox/${userId}/${itemId}/${u.split("/").pop()}`]))
  ),
  liveOutboxUri: vi.fn((stored: string) => stored),
  deleteOutboxFiles: vi.fn(),
  deleteAllOutboxFiles: vi.fn(),
  pruneOutboxFiles: vi.fn(),
}));
vi.mock("../outboxFiles", () => files);

const { classifyOutboxError, flushOutbox, queueFailedSave, isFlushing } = await import("../outboxFlush");
const outbox = await import("../outbox");
type OutboxItem = import("../outbox").OutboxItem;
type FlushDeps = import("../outboxFlush").FlushDeps;

const song: Song = {
  id: "1",
  title: "Lovely Day",
  artistName: "Bill Withers",
  albumName: "Menagerie",
  artworkUrl: null as unknown as string,
  provider: "apple_music",
  appleMusicId: "1",
  spotifyId: null,
  durationMs: 0,
};

const saveInput = (over: Partial<SaveMomentInput> = {}): SaveMomentInput => ({
  userId: "u1",
  song,
  reflection: "hi",
  moods: [],
  people: [],
  locationResult: null,
  momentDate: null,
  photos: [],
  ...over,
});

const T0 = 1_000_000;

const item = (id: string, queuedAt: number, over: Partial<OutboxItem> = {}): OutboxItem => ({
  id,
  userId: "u1",
  queuedAt,
  attempts: 0,
  lastAttemptAt: null,
  input: outbox.toOutboxInput(saveInput()),
  ...over,
});

/** An in-memory store with the outbox's own rules. */
function memoryStore(initial: OutboxItem[]) {
  let items = [...initial];
  return {
    get items() {
      return items;
    },
    add(i: OutboxItem) {
      items = outbox.withQueued(items, i);
    },
    list: vi.fn(async () => outbox.inQueuedOrder(items)),
    remove: vi.fn(async (_u: string, id: string) => {
      items = outbox.withoutItem(items, id);
    }),
    recordFailure: vi.fn(async (_u: string, id: string, failure, now: number) => {
      items = items.map((i) => (i.id === id ? outbox.afterFailure(i, failure, now) : i));
    }),
  };
}

const ok = (id: string): SaveMomentResult => ({ id, moment: { id } as SaveMomentResult["moment"], secondaryFailures: [] });

function deps(store: ReturnType<typeof memoryStore>, save: FlushDeps["save"], over: Partial<FlushDeps> = {}): FlushDeps {
  return {
    save,
    store,
    toSaveInput: (i) => outbox.fromOutboxInput(i),
    now: () => T0,
    isOnline: () => true,
    ...over,
  };
}

const NETWORK = { message: "TypeError: Network request failed", details: "", hint: "", code: "" };
const BAD_GATEWAY = { message: "Bad Gateway", status: 502 };
const RLS = { code: "42501", message: "new row violates row-level security policy for table \"moments\"" };

describe("classifyOutboxError", () => {
  it.each([
    ["a fetch that never got an answer", NETWORK, "offline"],
    ["a TypeError from fetch", new TypeError("Network request failed"), "offline"],
    ["an abort (the request timeout)", Object.assign(new Error("Aborted"), { name: "AbortError" }), "offline"],
    ["an abort wrapped by PostgREST", { message: "AbortError: Aborted", code: "" }, "offline"],
    ["a timeout", new Error("The request timed out."), "offline"],
    ["iOS offline", new Error("The Internet connection appears to be offline."), "offline"],
    ["HTTP 408", { message: "Request Timeout", status: 408 }, "offline"],
    ["a gateway error", BAD_GATEWAY, "server"],
    ["a storage 503", { message: "Service Unavailable", statusCode: "503" }, "server"],
    ["Supabase's cold-start 520", { message: "", status: 520 }, "server"],
    ["too many requests", { message: "slow down", status: 429 }, "server"],
    ["an expired session (401)", { message: "Unauthorized", status: 401 }, "server"],
    ["an expired JWT", { code: "PGRST301", message: "JWT expired" }, "server"],
    ["a cancelled statement, despite 'timeout' in its message", { code: "57014", message: "canceling statement due to statement timeout" }, "server"],
    ["a deadlock", { code: "40P01", message: "deadlock detected" }, "server"],
    ["the id already saved (a try that landed)", { code: "23505", message: "duplicate key" }, "server"],
    ["something unrecognised", new Error("weird"), "server"],
    ["a non-error", "boom", "server"],
    ["row-level security", RLS, "rejected"],
    ["a not-null violation", { code: "23502", message: "null value in column" }, "rejected"],
    ["a bad value", { code: "22P02", message: "invalid input syntax for type uuid" }, "rejected"],
    ["a trigger's raise", { code: "P0001", message: "nope" }, "rejected"],
    ["a column the database lacks", { code: "PGRST204", message: "Could not find the 'voice_path' column" }, "rejected"],
    ["a storage 400", { message: "Invalid key", statusCode: "400" }, "rejected"],
    ["a file that's too big", { message: "Payload too large", status: 413 }, "rejected"],
    ["storage RLS without a status", new Error("new row violates row-level security policy"), "rejected"],
    ["an unlinkable video", new Error("A video couldn't be linked to your Photos library. Remove it and try again."), "rejected"],
  ])("%s", (_label, err, kind) => {
    expect(classifyOutboxError(err)).toBe(kind);
  });
});

describe("flushOutbox", () => {
  beforeEach(() => {
    storage.reset();
    for (const fn of Object.values(files)) fn.mockClear();
  });

  it("saves due items one at a time, oldest first, under their own ids", async () => {
    const store = memoryStore([item("c", 3), item("a", 1), item("b", 2)]);
    const order: string[] = [];
    let inFlight = 0;
    const save = vi.fn(async (input: SaveMomentInput) => {
      inFlight++;
      expect(inFlight).toBe(1);
      await Promise.resolve();
      order.push(input.momentId!);
      inFlight--;
      return ok(input.momentId!);
    });
    const onSaved = vi.fn();

    const result = await flushOutbox("u1", deps(store, save, { onSaved }));

    expect(order).toEqual(["a", "b", "c"]);
    expect(result.saved).toEqual(["a", "b", "c"]);
    expect(store.items).toEqual([]);
    expect(onSaved).toHaveBeenCalledTimes(3);
    expect(onSaved.mock.calls[0][1].id).toBe("a");
  });

  it("stops the run on an offline failure and records it", async () => {
    const store = memoryStore([item("a", 1), item("b", 2), item("c", 3)]);
    const save = vi.fn(async (input: SaveMomentInput) => {
      if (input.momentId === "b") throw NETWORK;
      return ok(input.momentId!);
    });

    const result = await flushOutbox("u1", deps(store, save));

    expect(save.mock.calls.map((c) => c[0].momentId)).toEqual(["a", "b"]);
    expect(result).toMatchObject({ saved: ["a"], failed: [{ id: "b", kind: "offline" }], stoppedOffline: true });
    expect(store.items.map((i) => [i.id, i.lastErrorKind, i.attempts])).toEqual([
      ["b", "offline", 0],
      ["c", undefined, 0],
    ]);
  });

  it("moves on past a server failure, which then waits out its backoff", async () => {
    const store = memoryStore([item("a", 1), item("b", 2)]);
    const report = vi.fn();
    const save = vi.fn(async (input: SaveMomentInput) => {
      if (input.momentId === "a") throw BAD_GATEWAY;
      return ok(input.momentId!);
    });

    const result = await flushOutbox("u1", deps(store, save, { report }));

    expect(result).toMatchObject({ saved: ["b"], failed: [{ id: "a", kind: "server" }], stoppedOffline: false });
    expect(store.items[0]).toMatchObject({ id: "a", attempts: 1, lastErrorKind: "server", lastAttemptAt: T0 });
    expect(report).toHaveBeenCalledWith(BAD_GATEWAY, expect.objectContaining({ id: "a" }), "server");

    // Not due again inside the backoff...
    save.mockClear();
    await flushOutbox("u1", deps(store, save, { now: () => T0 + 10_000 }));
    expect(save).not.toHaveBeenCalled();
    // ...and tried once it runs out.
    await flushOutbox("u1", deps(store, save, { now: () => T0 + 30_000 }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("marks a refused save rejected, keeps it, and never tries it again on its own", async () => {
    const store = memoryStore([item("a", 1)]);
    const save = vi.fn(async () => {
      throw RLS;
    });

    await flushOutbox("u1", deps(store, save));
    expect(store.items[0]).toMatchObject({
      id: "a",
      lastErrorKind: "rejected",
      lastError: "You don't have permission to do that.",
    });

    await flushOutbox("u1", deps(store, save, { now: () => T0 + 1e9 }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("tries nothing when there's no connection", async () => {
    const store = memoryStore([item("a", 1)]);
    const save = vi.fn();
    const result = await flushOutbox("u1", deps(store, save, { isOnline: async () => false }));
    expect(result.skipped).toBe("offline");
    expect(save).not.toHaveBeenCalled();
  });

  it("never runs two flushes at once", async () => {
    const store = memoryStore([item("a", 1)]);
    let finish!: () => void;
    const save = vi.fn(
      (input: SaveMomentInput) => new Promise<SaveMomentResult>((r) => (finish = () => r(ok(input.momentId!))))
    );

    const first = flushOutbox("u1", deps(store, save));
    const second = await flushOutbox("u1", deps(store, save));
    expect(second.skipped).toBe("busy");
    expect(isFlushing()).toBe(true);

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    finish();
    await first;
    expect(isFlushing()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("tries a moment queued while the run was going", async () => {
    const store = memoryStore([item("a", 1)]);
    const save = vi.fn(async (input: SaveMomentInput) => {
      if (input.momentId === "a") store.add(item("late", 5));
      return ok(input.momentId!);
    });
    const result = await flushOutbox("u1", deps(store, save));
    expect(result.saved).toEqual(["a", "late"]);
  });

  it("an onSaved that throws doesn't stop the run", async () => {
    const store = memoryStore([item("a", 1), item("b", 2)]);
    const save = vi.fn(async (input: SaveMomentInput) => ok(input.momentId!));
    const result = await flushOutbox(
      "u1",
      deps(store, save, {
        onSaved: () => {
          throw new Error("ui");
        },
      })
    );
    expect(result.saved).toEqual(["a", "b"]);
  });

  it("stops before the next item once whoever started it has gone (sign-out)", async () => {
    let active = true;
    const store = memoryStore([item("a", 1), item("b", 2)]);
    const save = vi.fn(async (input: SaveMomentInput) => {
      active = false;
      return ok(input.momentId!);
    });
    const result = await flushOutbox("u1", deps(store, save, { isActive: () => active }));
    expect(result.saved).toEqual(["a"]);
    expect(store.items.map((i) => i.id)).toEqual(["b"]);
  });

  it("with the real outbox: a save removes the item and deletes its kept files", async () => {
    await outbox.enqueueOutbox("u1", saveInput({ momentId: "m1", photos: ["file:///cache/a.jpg"] }), { now: 1 });
    const save = vi.fn(async (input: SaveMomentInput) => ok(input.momentId!));

    const result = await flushOutbox("u1", {
      save,
      store: { list: outbox.listOutbox, remove: outbox.removeOutboxItem, recordFailure: outbox.recordOutboxFailure },
      toSaveInput: outbox.outboxSaveInput,
      now: () => T0,
      isOnline: () => true,
    });

    expect(result.saved).toEqual(["m1"]);
    expect(save.mock.calls[0][0]).toMatchObject({ momentId: "m1", photos: ["doc:capture-outbox/u1/m1/a.jpg"] });
    expect(await outbox.outboxCount("u1")).toBe(0);
    expect(files.deleteOutboxFiles).toHaveBeenCalledWith("u1", "m1");
  });

  it("with the real outbox: unknown input fields reach the save unchanged", async () => {
    const withVoice = { ...saveInput({ momentId: "m1" }), voiceDurationMs: 4200, voiceUri: "file:///cache/v.m4a" };
    await outbox.enqueueOutbox("u1", withVoice as SaveMomentInput, { now: 1 });
    const save = vi.fn(async (input: SaveMomentInput) => ok(input.momentId!));

    await flushOutbox("u1", {
      save,
      store: { list: outbox.listOutbox, remove: outbox.removeOutboxItem, recordFailure: outbox.recordOutboxFailure },
      toSaveInput: outbox.outboxSaveInput,
      now: () => T0,
      isOnline: () => true,
    });

    expect(save.mock.calls[0][0]).toMatchObject({
      voiceDurationMs: 4200,
      voiceUri: "doc:capture-outbox/u1/m1/v.m4a",
    });
  });
});

describe("queueFailedSave", () => {
  beforeEach(() => storage.reset());

  it("queues a save that failed for want of a connection, with that failure recorded", async () => {
    const queued = await queueFailedSave("u1", saveInput({ momentId: "m1" }), NETWORK);
    expect(queued).toMatchObject({ id: "m1", lastErrorKind: "offline", attempts: 0 });
    expect(await outbox.outboxCount("u1")).toBe(1);
  });

  it("queues a server failure with its backoff started", async () => {
    const queued = await queueFailedSave("u1", saveInput({ momentId: "m1" }), BAD_GATEWAY);
    expect(queued).toMatchObject({ lastErrorKind: "server", attempts: 1 });
  });

  it("doesn't queue a save retrying won't fix: capture shows the error instead", async () => {
    expect(await queueFailedSave("u1", saveInput(), RLS)).toBeNull();
    expect(await outbox.outboxCount("u1")).toBe(0);
  });
});
