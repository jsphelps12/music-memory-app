/**
 * Capture drafts hold writing that hasn't been saved yet, so losing one is the
 * worst thing this app can do. These cover the rules (pure) and the storage
 * layer against an in-memory AsyncStorage, including the two ways a draft used
 * to go wrong: a pre-filled capture wiping an earlier draft, and a draft
 * coming back after its moment was saved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";
import type { Song } from "@/types";

const storage = createAsyncStorageMock();
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage, ...storage }));

const {
  isWorthKeeping,
  liveDrafts,
  withDraft,
  withoutDraft,
  draftToPickUp,
  startDraftSession,
  afterDraftLoad,
  afterMomentSaved,
  canWriteDraft,
  parseStoredDrafts,
  loadDraftToPickUp,
  saveCaptureDraft,
  discardCaptureDraft,
  clearCaptureDraft,
  releaseDraft,
  MAX_AGE_MS,
  MAX_DRAFTS,
} = await import("../captureDraft");
type CaptureDraft = import("../captureDraft").CaptureDraft;

const USER = "user-1";
const NOW = 1_700_000_000_000;
const KEY = `captureDrafts:${USER}`;
const LEGACY_KEY = `captureDraft:${USER}`;

const song: Song = {
  id: "s1",
  title: "Harvest Moon",
  artistName: "Neil Young",
  albumName: "Harvest Moon",
  artworkUrl: "",
  provider: "apple_music",
  appleMusicId: "s1",
  spotifyId: null,
  durationMs: 0,
};

function draft(id: string, reflection: string, savedAt = NOW): CaptureDraft {
  return { id, reflection, song: null, savedAt };
}

function stored(): CaptureDraft[] {
  const raw = storage.map.get(KEY);
  return raw ? (JSON.parse(raw) as CaptureDraft[]) : [];
}

beforeEach(() => {
  storage.reset();
});

describe("isWorthKeeping", () => {
  it("keeps writing, not blanks", () => {
    expect(isWorthKeeping("a night drive")).toBe(true);
    expect(isWorthKeeping("   \n ")).toBe(false);
  });

  it("doesn't count a starter or prompt the app put in as writing", () => {
    const templates = ["It takes me back to "];
    expect(isWorthKeeping("It takes me back to ", templates)).toBe(false);
    expect(isWorthKeeping("It takes me back to Lisbon", templates)).toBe(true);
  });
});

describe("list rules", () => {
  it("drops expired and empty drafts and puts the newest first", () => {
    const list = [
      draft("old", "stale", NOW - MAX_AGE_MS - 1),
      draft("a", "first", NOW - 2000),
      draft("b", "second", NOW - 1000),
      draft("empty", "  "),
    ];
    expect(liveDrafts(list, NOW).map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("caps how many it keeps", () => {
    const list = Array.from({ length: MAX_DRAFTS + 3 }, (_, i) => draft(`d${i}`, "words", NOW - i));
    expect(liveDrafts(list, NOW)).toHaveLength(MAX_DRAFTS);
  });

  it("writing one capture's draft never touches another's", () => {
    const list = [draft("earlier", "three paragraphs about a wedding", NOW - 5000)];
    const next = withDraft(list, "mine", { reflection: "new words", song }, NOW);
    expect(next.find((d) => d.id === "earlier")?.reflection).toBe("three paragraphs about a wedding");
    expect(next.find((d) => d.id === "mine")).toMatchObject({ reflection: "new words", song, savedAt: NOW });
  });

  it("an empty write only takes out the capture's own draft", () => {
    const list = [draft("earlier", "keep me", NOW - 5000), draft("mine", "typed then deleted", NOW - 100)];
    const next = withDraft(list, "mine", { reflection: "", song: null }, NOW);
    expect(next.map((d) => d.id)).toEqual(["earlier"]);
  });

  it("discarding one leaves the rest", () => {
    const list = [draft("a", "one"), draft("b", "two")];
    expect(withoutDraft(list, "a", NOW).map((d) => d.id)).toEqual(["b"]);
  });
});

describe("draftToPickUp", () => {
  const list = [draft("older", "first", NOW - 2000), draft("newer", "second", NOW - 1000)];

  it("a blank capture picks up the newest draft", () => {
    expect(draftToPickUp(list, { prefilled: false, typed: "" }, NOW)?.id).toBe("newer");
  });

  it("a pre-filled capture never picks one up", () => {
    expect(draftToPickUp(list, { prefilled: true, typed: "" }, NOW)).toBeNull();
  });

  it("never replaces writing typed while the read was in flight", () => {
    expect(draftToPickUp(list, { prefilled: false, typed: "already writing" }, NOW)).toBeNull();
  });
});

describe("draft session", () => {
  it("a pre-filled capture can write straight away, under its own id", () => {
    const session = startDraftSession("fresh", true);
    expect(canWriteDraft(session)).toBe(true);
    expect(session.id).toBe("fresh");
  });

  it("a blank capture waits for the read, then takes over the picked-up draft's id", () => {
    const session = startDraftSession("fresh", false);
    expect(canWriteDraft(session)).toBe(false);
    const loaded = afterDraftLoad(session, draft("stored", "words"));
    expect(loaded).toEqual({ id: "stored", phase: "open" });
    expect(afterDraftLoad(session, null)).toEqual({ id: "fresh", phase: "open" });
  });

  it("writes nothing once the moment is saved", () => {
    const saved = afterMomentSaved({ id: "x", phase: "open" });
    expect(canWriteDraft(saved)).toBe(false);
    // A read finishing late doesn't reopen it.
    expect(canWriteDraft(afterDraftLoad(saved, null))).toBe(false);
    expect(canWriteDraft(null)).toBe(false);
  });
});

describe("parseStoredDrafts", () => {
  it("folds in the single draft older builds kept", () => {
    const legacy = JSON.stringify({ reflection: "from before ids", song, savedAt: NOW });
    const list = parseStoredDrafts(JSON.stringify([draft("a", "one")]), legacy);
    expect(list.map((d) => d.id).sort()).toEqual(["a", "legacy"]);
    expect(list.find((d) => d.id === "legacy")?.reflection).toBe("from before ids");
  });

  it("survives junk", () => {
    expect(parseStoredDrafts("not json", "{")).toEqual([]);
    expect(parseStoredDrafts(JSON.stringify([{ nope: 1 }, draft("a", "one")]), null).map((d) => d.id)).toEqual(["a"]);
  });
});

describe("storage: a pre-filled capture keeps an earlier draft", () => {
  beforeEach(() => {
    storage.seed(KEY, JSON.stringify([draft("earlier", "Half a page about Dad's truck", Date.now() - 60_000)]));
  });

  it("opening pre-filled, writing nothing and leaving doesn't wipe it", async () => {
    const session = startDraftSession("shared", true);
    // The debounce and the flush on leaving both write the empty form.
    await saveCaptureDraft(USER, session.id, { reflection: "", song });
    await saveCaptureDraft(USER, session.id, { reflection: "", song });
    expect(stored().map((d) => d.reflection)).toEqual(["Half a page about Dad's truck"]);
  });

  it("saving a pre-filled capture doesn't wipe it", async () => {
    const session = startDraftSession("shared", true);
    await saveCaptureDraft(USER, session.id, { reflection: "Heard this at the market", song });
    await discardCaptureDraft(USER, afterMomentSaved(session).id);
    expect(stored().map((d) => d.id)).toEqual(["earlier"]);
  });

  it("a pre-filled capture's own writing is kept beside it", async () => {
    await saveCaptureDraft(USER, "shared", { reflection: "Heard this at the market", song });
    expect(stored().map((d) => d.id)).toEqual(["shared", "earlier"]);
  });

  it("the next blank capture picks it up, and saving that one clears it", async () => {
    const picked = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "" });
    expect(picked?.reflection).toBe("Half a page about Dad's truck");
    const session = afterDraftLoad(startDraftSession("blank", false), picked);
    await saveCaptureDraft(USER, session.id, { reflection: "Half a page about Dad's truck, finished", song });
    expect(stored()).toHaveLength(1);
    await discardCaptureDraft(USER, afterMomentSaved(session).id);
    expect(storage.map.has(KEY)).toBe(false);
    releaseDraft(session.id);
  });

  it("a second blank capture opened over the first doesn't pick up the same draft", async () => {
    const first = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "" });
    expect(first?.id).toBe("earlier");
    expect(await loadDraftToPickUp(USER, { prefilled: false, typed: () => "" })).toBeNull();
    releaseDraft("earlier");
    expect((await loadDraftToPickUp(USER, { prefilled: false, typed: () => "" }))?.id).toBe("earlier");
    releaseDraft("earlier");
  });

  it("a pre-filled capture doesn't pick it up", async () => {
    expect(await loadDraftToPickUp(USER, { prefilled: true, typed: () => "" })).toBeNull();
  });
});

describe("storage: a saved moment's draft stays gone", () => {
  it("a write already in flight when the save lands can't bring it back", async () => {
    // The debounce fires during the save, then the save discards: both are
    // started before either finishes. They must land in order.
    // The write's read is the slow one, so unordered it would land last.
    const slowGet = storage.getItem.getMockImplementation() as (k: string) => Promise<string | null>;
    let calls = 0;
    storage.getItem.mockImplementation(async (k: string) => {
      if (++calls <= 2) await new Promise((r) => setTimeout(r, 10));
      return slowGet(k);
    });
    const write = saveCaptureDraft(USER, "mine", { reflection: "the last few words", song });
    const discard = discardCaptureDraft(USER, "mine");
    await Promise.all([write, discard]);
    expect(storage.map.has(KEY)).toBe(false);
    storage.getItem.mockImplementation(slowGet);
  });

  it("two captures writing at once both keep their drafts", async () => {
    await Promise.all([
      saveCaptureDraft(USER, "a", { reflection: "first", song: null }),
      saveCaptureDraft(USER, "b", { reflection: "second", song: null }),
    ]);
    expect(stored().map((d) => d.id).sort()).toEqual(["a", "b"]);
  });

  it("after the save, the session refuses the flush on leaving", () => {
    const saved = afterMomentSaved(afterDraftLoad(startDraftSession("blank", false), null));
    expect(canWriteDraft(saved)).toBe(false);
  });
});

describe("storage: old single draft", () => {
  it("is picked up, and moved into the list on the next write", async () => {
    storage.seed(LEGACY_KEY, JSON.stringify({ reflection: "from 1.4 beta", song: null, savedAt: Date.now() }));
    const picked = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "" });
    expect(picked).toMatchObject({ id: "legacy", reflection: "from 1.4 beta" });
    await saveCaptureDraft(USER, "other", { reflection: "new", song: null });
    expect(storage.map.has(LEGACY_KEY)).toBe(false);
    expect(stored().map((d) => d.id).sort()).toEqual(["legacy", "other"]);
    releaseDraft("legacy");
  });

  it("sign-out clears both", async () => {
    storage.seed(LEGACY_KEY, JSON.stringify({ reflection: "x", song: null, savedAt: Date.now() }));
    storage.seed(KEY, JSON.stringify([draft("a", "one", Date.now())]));
    await clearCaptureDraft(USER);
    expect(storage.map.size).toBe(0);
  });
});
