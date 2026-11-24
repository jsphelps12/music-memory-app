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

// The file side (expo-file-system, Photos) is native glue: stand-ins that
// record what was kept and pruned. A photo with no library id is "copied"
// into its draft's folder, as the real one does.
const files = vi.hoisted(() => ({
  keepDraftPhotos: vi.fn(async (userId: string, draftId: string, photos: { uri: string; assetId?: string | null }[]) =>
    photos.map((p) =>
      p.assetId || p.uri.startsWith("doc:")
        ? p
        : { ...p, uri: `doc:capture-drafts/${userId}/${draftId}/${p.uri.split("/").pop()}` }
    )
  ),
  pruneDraftFiles: vi.fn(),
  deleteDraftFiles: vi.fn(),
}));
vi.mock("../captureDraftFiles", () => files);
// Voice takes: already in the app's documents, so a draft just stores the
// path relative to them, as storedDraftVoice does.
const voiceFiles = vi.hoisted(() => ({
  storedDraftVoice: vi.fn((v: { uri: string; durationMs: number }) => ({
    ...v,
    uri: v.uri.replace("file:///Documents/", "doc:"),
  })),
  pruneVoiceFiles: vi.fn(),
  deleteVoiceFiles: vi.fn(),
}));
vi.mock("../voiceFiles", () => voiceFiles);

const {
  isWorthKeeping,
  hasWriting,
  draftTitle,
  draftMeta,
  liveDrafts,
  withDraft,
  withoutDraft,
  draftToPickUp,
  draftById,
  draftWhenLabel,
  draftExcerpt,
  continueDraftSubtitle,
  startDraftSession,
  afterDraftLoad,
  afterMomentSaved,
  afterDraftDiscarded,
  canWriteDraft,
  parseStoredDrafts,
  loadDraftToPickUp,
  listCaptureDrafts,
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
  files.keepDraftPhotos.mockClear();
  files.pruneDraftFiles.mockClear();
  files.deleteDraftFiles.mockClear();
  voiceFiles.storedDraftVoice.mockClear();
  voiceFiles.pruneVoiceFiles.mockClear();
  voiceFiles.deleteVoiceFiles.mockClear();
});

describe("isWorthKeeping", () => {
  it("keeps writing, not blanks", () => {
    expect(isWorthKeeping({ reflection: "a night drive" })).toBe(true);
    expect(isWorthKeeping({ reflection: "   \n " })).toBe(false);
  });

  it("doesn't count a starter or prompt the app put in as writing", () => {
    const templates = ["It takes me back to "];
    expect(hasWriting("It takes me back to ", templates)).toBe(false);
    expect(isWorthKeeping({ reflection: "It takes me back to " }, { templates })).toBe(false);
    expect(isWorthKeeping({ reflection: "It takes me back to Lisbon" }, { templates })).toBe(true);
  });

  it("keeps a photo on its own, with no words or song", () => {
    expect(isWorthKeeping({ reflection: "", photos: [{ uri: "file:///cam.jpg" }] })).toBe(true);
    expect(isWorthKeeping({ reflection: "", photos: [] })).toBe(false);
  });

  it("doesn't count photos the capture came with (Last week, shared in)", () => {
    const photos = [{ uri: "file:///lastweek.jpg", assetId: "A1" }];
    expect(isWorthKeeping({ reflection: "", photos }, { photos: ["file:///lastweek.jpg"] })).toBe(false);
    const added = [...photos, { uri: "file:///cam.jpg" }];
    expect(isWorthKeeping({ reflection: "", photos: added }, { photos: ["file:///lastweek.jpg"] })).toBe(true);
    expect(isWorthKeeping({ reflection: "words", photos }, { photos: ["file:///lastweek.jpg"] })).toBe(true);
  });
});

describe("what a draft keeps", () => {
  const details = {
    reflection: "",
    song,
    photos: [
      { uri: "file:///lib.jpg", assetId: "A1", videoMs: null },
      { uri: "file:///poster.jpg", assetId: "V1", videoMs: 12_000 },
      { uri: "file:///cam.jpg", assetId: null, videoMs: null },
    ],
    moods: ["nostalgic"],
    people: ["Sam"],
    peopleLinks: [{ name: "Sam", friendId: "f1" }],
    date: NOW - 86_400_000,
    place: { name: "Lisbon", lat: 38.7, lng: -9.1 },
    album: { id: "al1", name: "Summer" },
  };

  it("keeps the photos, moods, people, date, place and album, versioned", () => {
    const [kept] = withDraft([], "mine", details, NOW);
    expect(kept).toEqual({
      id: "mine",
      reflection: "",
      song,
      savedAt: NOW,
      v: 2,
      photos: [
        { uri: "file:///lib.jpg", assetId: "A1" },
        { uri: "file:///poster.jpg", assetId: "V1", videoMs: 12_000 },
        { uri: "file:///cam.jpg" },
      ],
      moods: ["nostalgic"],
      people: ["Sam"],
      peopleLinks: [{ name: "Sam", friendId: "f1" }],
      date: NOW - 86_400_000,
      place: { name: "Lisbon", lat: 38.7, lng: -9.1 },
      album: { id: "al1", name: "Summer" },
    });
  });

  it("keeps \"No specific date\" as null, and leaves out what isn't set", () => {
    const [kept] = withDraft([], "mine", { reflection: "words", song: null, photos: [], moods: [], date: null }, NOW);
    expect(kept).toEqual({ id: "mine", reflection: "words", song: null, savedAt: NOW, v: 2, date: null });
  });

  it("details without words or a photo aren't worth a draft", () => {
    const { photos: _p, ...rest } = details;
    expect(withDraft([], "mine", rest, NOW)).toEqual([]);
  });

  it("reads back through storage, and drafts from before load as they were", () => {
    const old = { id: "old", reflection: "from 1.4.0", song: null, savedAt: NOW };
    const [kept] = withDraft([], "mine", details, NOW);
    const list = parseStoredDrafts(JSON.stringify([kept, old]), null);
    expect(list[0]).toEqual(kept);
    expect(list[1]).toEqual(old);
  });

  it("drops a detail that doesn't read right, not the draft", () => {
    const raw = JSON.stringify([
      {
        id: "a",
        reflection: "words",
        song: null,
        savedAt: NOW,
        v: 2,
        photos: [{ uri: "file:///ok.jpg" }, { nope: 1 }, { uri: 3 }],
        moods: ["calm", 4],
        peopleLinks: [{ name: "Sam" }, { name: "Jo", friendId: "f2" }],
        date: "yesterday",
        place: { name: "Somewhere", lat: "x", lng: 1 },
        album: { id: "al1" },
      },
    ]);
    expect(parseStoredDrafts(raw, null)).toEqual([
      {
        id: "a",
        reflection: "words",
        song: null,
        savedAt: NOW,
        v: 2,
        photos: [{ uri: "file:///ok.jpg" }],
        moods: ["calm"],
        peopleLinks: [{ name: "Jo", friendId: "f2" }],
      },
    ]);
  });

  it("a photo-only draft is listed under how many photos", () => {
    const [photoOnly] = withDraft([], "p", { reflection: "", song: null, photos: details.photos.slice(0, 1) }, NOW);
    expect(draftTitle(photoOnly)).toBe("1 photo");
    expect(continueDraftSubtitle([photoOnly])).toBe("1 photo");
    expect(draftMeta(photoOnly, NOW)).not.toContain("photo");
  });

  it("a draft with words says its photos in the meta", () => {
    const [kept] = withDraft([], "w", { ...details, reflection: "The drive to Kona" }, NOW);
    expect(draftTitle(kept)).toBe("The drive to Kona");
    expect(draftMeta(kept, NOW)).toBe(`Harvest Moon · 2 photos, 1 video · ${draftWhenLabel(NOW, NOW)}`);
    expect(draftMeta(draft("x", "words"), NOW)).toBe(draftWhenLabel(NOW, NOW));
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

  it("a plain capture opens blank, drafts or not", () => {
    expect(draftToPickUp(list, { prefilled: false, typed: "" }, NOW)).toBeNull();
  });

  it("a pre-filled capture never picks one up", () => {
    expect(draftToPickUp(list, { prefilled: true, typed: "" }, NOW)).toBeNull();
    expect(draftToPickUp(list, { prefilled: true, typed: "", draftId: "older" }, NOW)).toBeNull();
  });

  it("never replaces writing typed while the read was in flight", () => {
    expect(draftToPickUp(list, { prefilled: false, typed: "already writing", draftId: "older" }, NOW)).toBeNull();
  });
});

describe("picking one draft", () => {
  const list = [draft("older", "first", NOW - 2000), draft("newer", "second", NOW - 1000)];

  it("finds a live draft by id, and not an expired or emptied one", () => {
    expect(draftById(list, "older", NOW)?.reflection).toBe("first");
    expect(draftById([draft("old", "stale", NOW - MAX_AGE_MS - 1)], "old", NOW)).toBeNull();
    expect(draftById([draft("blank", "  ")], "blank", NOW)).toBeNull();
    expect(draftById(list, "missing", NOW)).toBeNull();
  });

  it("Continue a draft opens exactly that one, not the newest", () => {
    expect(draftToPickUp(list, { prefilled: false, typed: "", draftId: "older" }, NOW)?.id).toBe("older");
  });

  it("if the chosen draft has gone, it opens blank rather than a different one", () => {
    expect(draftToPickUp(list, { prefilled: false, typed: "", draftId: "missing" }, NOW)).toBeNull();
  });
});

describe("draftWhenLabel", () => {
  // Local time throughout, so this passes in any time zone.
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
  const now = at(18, 15); // Wednesday 18 Nov 2026, 3pm

  it("names the part of today", () => {
    expect(draftWhenLabel(at(18, 9), now)).toBe("this morning");
    expect(draftWhenLabel(at(18, 13), now)).toBe("this afternoon");
    expect(draftWhenLabel(at(18, 19), at(18, 22))).toBe("this evening");
    expect(draftWhenLabel(at(18, 1), now)).toBe("last night");
  });

  it("says yesterday, or last night for a late one", () => {
    expect(draftWhenLabel(at(17, 10), now)).toBe("yesterday");
    expect(draftWhenLabel(at(17, 23), now)).toBe("last night");
  });

  it("names the weekday within the week, then the date", () => {
    expect(draftWhenLabel(at(17, 10), at(18, 0, 5))).toBe("yesterday");
    expect(draftWhenLabel(at(16, 10), now)).toBe("Monday");
    expect(draftWhenLabel(at(12, 10), now)).toBe("Thursday");
    expect(draftWhenLabel(at(11, 10), now)).toBe("Nov 11");
  });
});

describe("draft excerpts", () => {
  it("takes the first line of writing", () => {
    expect(draftExcerpt("\n  The drive to Kona  \nand then the rain")).toBe("The drive to Kona");
  });

  it("cuts a long line at a word", () => {
    const text = "We played this on the porch every night of that summer until the record wore out";
    const cut = draftExcerpt(text, 30);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(31);
    expect(text.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut).toBe("We played this on the porch…");
  });

  it("the menu row says the one draft's words, or how many", () => {
    expect(continueDraftSubtitle([draft("a", "Dad's truck")])).toBe("Dad's truck");
    expect(continueDraftSubtitle([{ ...draft("a", "Dad's truck"), song }])).toBe(`Dad's truck · ${song.title}`);
    expect(continueDraftSubtitle([draft("a", "one"), draft("b", "two")])).toBe("2 drafts");
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

describe("closing capture with Discard", () => {
  it("writes nothing more, so the flush on leaving can't bring the draft back", () => {
    const discarded = afterDraftDiscarded({ id: "x", phase: "open" });
    expect(canWriteDraft(discarded)).toBe(false);
    expect(discarded.id).toBe("x");
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

  it("a plain capture opens blank; Continue a draft picks it up, and saving that one clears it", async () => {
    expect(await loadDraftToPickUp(USER, { prefilled: false, typed: () => "" })).toBeNull();
    const picked = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "earlier" });
    expect(picked?.reflection).toBe("Half a page about Dad's truck");
    const session = afterDraftLoad(startDraftSession("blank", false), picked);
    await saveCaptureDraft(USER, session.id, { reflection: "Half a page about Dad's truck, finished", song });
    expect(stored()).toHaveLength(1);
    await discardCaptureDraft(USER, afterMomentSaved(session).id);
    expect(storage.map.has(KEY)).toBe(false);
    releaseDraft(session.id);
  });

  it("a second capture opened over the first can't pick up the same draft", async () => {
    const first = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "earlier" });
    expect(first?.id).toBe("earlier");
    expect(await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "earlier" })).toBeNull();
    releaseDraft("earlier");
    expect((await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "earlier" }))?.id).toBe("earlier");
    releaseDraft("earlier");
  });

  it("a pre-filled capture doesn't pick it up", async () => {
    expect(await loadDraftToPickUp(USER, { prefilled: true, typed: () => "" })).toBeNull();
  });
});

describe("storage: Continue a draft", () => {
  beforeEach(() => {
    storage.seed(
      KEY,
      JSON.stringify([
        draft("older", "the wedding", Date.now() - 120_000),
        draft("newer", "the drive", Date.now() - 60_000),
        draft("stale", "too old", Date.now() - MAX_AGE_MS - 1),
      ])
    );
  });

  it("lists the live drafts, newest first, leaving out one an open capture holds", async () => {
    expect((await listCaptureDrafts(USER)).map((d) => d.id)).toEqual(["newer", "older"]);
    const held = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "newer" });
    expect(held?.id).toBe("newer");
    expect((await listCaptureDrafts(USER)).map((d) => d.id)).toEqual(["older"]);
    releaseDraft("newer");
  });

  it("a capture opened with a draft id picks up exactly that one", async () => {
    const picked = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "older" });
    expect(picked?.reflection).toBe("the wedding");
    // The plain + opens blank.
    expect(await loadDraftToPickUp(USER, { prefilled: false, typed: () => "" })).toBeNull();
    // And the chosen one can't be opened twice.
    expect(await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "older" })).toBeNull();
    releaseDraft("older");
  });

  it("Discard on close takes out only that capture's draft", async () => {
    await discardCaptureDraft(USER, "newer");
    expect(stored().map((d) => d.id)).toEqual(["older"]);
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
    expect((await listCaptureDrafts(USER)).map((d) => d.id)).toEqual(["legacy"]);
    const picked = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "legacy" });
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
    expect(files.deleteDraftFiles).toHaveBeenCalledWith(USER);
    expect(voiceFiles.deleteVoiceFiles).toHaveBeenCalledWith(USER);
  });
});

describe("storage: a draft's photos", () => {
  const camera = { uri: "file:///Caches/ImagePicker/cam.jpg", assetId: null, videoMs: null };
  const library = { uri: "file:///Caches/ImagePicker/lib.jpg", assetId: "A1", videoMs: null };
  const lastPrune = () => files.pruneDraftFiles.mock.calls.at(-1)?.[1] as Map<string, Set<string>>;

  it("a photo-only draft is kept, with a copy of the camera photo and the library one by id", async () => {
    await saveCaptureDraft(USER, "mine", { reflection: "", song: null, photos: [camera, library] });
    expect(files.keepDraftPhotos).toHaveBeenCalledWith(USER, "mine", [{ uri: camera.uri }, { uri: library.uri, assetId: "A1" }]);
    expect(stored()[0].photos).toEqual([
      { uri: `doc:capture-drafts/${USER}/mine/cam.jpg` },
      { uri: library.uri, assetId: "A1" },
    ]);
    // The copy is one the cleanup keeps.
    expect(lastPrune().get("mine")).toEqual(new Set(["cam.jpg"]));
  });

  it("only photos that came with the capture: nothing kept, nothing copied", async () => {
    await saveCaptureDraft(USER, "shared", { reflection: "", song, photos: [library] }, { photos: [library.uri] });
    expect(storage.map.has(KEY)).toBe(false);
    expect(files.keepDraftPhotos).not.toHaveBeenCalled();
  });

  it("saving the moment, or Discard, lets the cleanup take its copies", async () => {
    await saveCaptureDraft(USER, "mine", { reflection: "", song: null, photos: [camera] });
    await saveCaptureDraft(USER, "other", { reflection: "", song: null, photos: [{ ...camera, uri: "file:///b.jpg" }] });
    await discardCaptureDraft(USER, "mine");
    expect(stored().map((d) => d.id)).toEqual(["other"]);
    expect([...lastPrune().keys()]).toEqual(["other"]);
  });

  it("taking the last photo off a photo-only draft takes the draft (and its copy) out", async () => {
    await saveCaptureDraft(USER, "mine", { reflection: "", song: null, photos: [camera] });
    await saveCaptureDraft(USER, "mine", { reflection: "", song: null, photos: [] });
    expect(storage.map.has(KEY)).toBe(false);
    expect(lastPrune().size).toBe(0);
  });

  it("an expired draft's copies go when the drafts are next listed", async () => {
    const [kept] = withDraft([], "old", { reflection: "", song: null, photos: [{ uri: `doc:capture-drafts/${USER}/old/cam.jpg` }] }, Date.now() - MAX_AGE_MS - 1);
    storage.seed(KEY, JSON.stringify([kept, draft("live", "words", Date.now())]));
    expect((await listCaptureDrafts(USER)).map((d) => d.id)).toEqual(["live"]);
    expect(lastPrune().has("old")).toBe(false);
  });

  it("Continue a draft brings its photos and details back", async () => {
    await saveCaptureDraft(USER, "mine", {
      reflection: "",
      song,
      photos: [camera, library],
      moods: ["calm"],
      place: { name: "Lisbon", lat: 38.7, lng: -9.1 },
      album: { id: "al1", name: "Summer" },
    });
    const picked = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "mine" });
    expect(picked).toMatchObject({
      id: "mine",
      song,
      photos: [{ uri: `doc:capture-drafts/${USER}/mine/cam.jpg` }, { uri: library.uri, assetId: "A1" }],
      moods: ["calm"],
      place: { name: "Lisbon", lat: 38.7, lng: -9.1 },
      album: { id: "al1", name: "Summer" },
    });
    releaseDraft("mine");
  });
});

describe("the part of the song in a draft", () => {
  it("keeps the part with its song and reads it back", () => {
    const [kept] = withDraft([], "p", { reflection: "words", song, partMs: 161_000 }, NOW);
    expect(kept.partMs).toBe(161_000);
    const [read] = parseStoredDrafts(JSON.stringify([kept]), null);
    expect(read.partMs).toBe(161_000);
  });

  it("drops a part with no song, and a malformed one", () => {
    const [kept] = withDraft([], "p", { reflection: "words", song: null, partMs: 161_000 }, NOW);
    expect(kept.partMs).toBeUndefined();
    const [read] = parseStoredDrafts(JSON.stringify([{ ...kept, partMs: "soon" }]), null);
    expect(read.partMs).toBeUndefined();
  });
});

describe("a voice recording in a draft", () => {
  const take = { uri: `file:///Documents/capture-voice/${USER}/voice-1.m4a`, durationMs: 42_000 };
  const storedTake = { uri: `doc:capture-voice/${USER}/voice-1.m4a`, durationMs: 42_000 };
  const lastVoicePrune = () => voiceFiles.pruneVoiceFiles.mock.calls.at(-1)?.[1] as Set<string>;

  it("is worth keeping on its own, like a photo", () => {
    expect(isWorthKeeping({ reflection: "", voice: take })).toBe(true);
    expect(isWorthKeeping({ reflection: "", voice: null })).toBe(false);
  });

  it("keeps the take and reads it back", () => {
    const [kept] = withDraft([], "v", { reflection: "", song: null, voice: take }, NOW);
    expect(kept.voice).toEqual(take);
    const [read] = parseStoredDrafts(JSON.stringify([kept]), null);
    expect(read.voice).toEqual(take);
  });

  it("leaves off a malformed one rather than losing the draft", () => {
    const [kept] = withDraft([], "v", { reflection: "words", song: null }, NOW);
    expect(kept.voice).toBeUndefined();
    const [read] = parseStoredDrafts(JSON.stringify([{ ...kept, voice: { uri: 3, durationMs: "long" } }]), null);
    expect(read.reflection).toBe("words");
    expect(read.voice).toBeUndefined();
  });

  it("is called by its recording in the drafts list when there's nothing else", () => {
    const voiceOnly = { ...draft("v", ""), song, voice: take };
    expect(draftTitle(voiceOnly)).toBe("Voice recording");
    expect(draftMeta(voiceOnly, NOW)).not.toContain("Voice 0:42");
    const withWords = { ...draft("w", "Dad's truck"), voice: take };
    expect(draftMeta(withWords, NOW)).toContain("Voice 0:42");
  });

  it("stores the take relative to the app's folders, and the cleanup keeps it", async () => {
    await saveCaptureDraft(USER, "mine", { reflection: "", song: null, voice: take });
    expect(voiceFiles.storedDraftVoice).toHaveBeenCalledWith(take);
    expect(stored()[0].voice).toEqual(storedTake);
    expect(lastVoicePrune()).toEqual(new Set(["voice-1.m4a"]));
  });

  it("saving the moment, or Discard, lets the cleanup take it", async () => {
    await saveCaptureDraft(USER, "mine", { reflection: "", song: null, voice: take });
    await discardCaptureDraft(USER, "mine");
    expect(storage.map.has(KEY)).toBe(false);
    expect(lastVoicePrune().size).toBe(0);
  });

  it("Continue a draft brings the take back", async () => {
    await saveCaptureDraft(USER, "mine", { reflection: "", song, voice: take });
    const picked = await loadDraftToPickUp(USER, { prefilled: false, typed: () => "", draftId: "mine" });
    expect(picked?.voice).toEqual(storedTake);
    releaseDraft("mine");
  });
});
