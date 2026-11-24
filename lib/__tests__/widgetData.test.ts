/**
 * The Memory widget's writer: words only with the setting on and the app
 * lock off, identical weeks not rewritten, refreshes throttled, and
 * sign-out wiping the file even mid-run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";

const storage = createAsyncStorageMock();
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage, ...storage }));

const native = {
  writeWidgetData: vi.fn(async (_json: string, _images: Record<string, string>) => true),
  clearWidgetData: vi.fn(async () => true),
  reloadWidgets: vi.fn(async () => {}),
};
vi.mock("@/modules/now-playing", () => native);

const fetchMomentsByIds = vi.fn(async (_uid: string, ids: readonly string[]) =>
  ids.map((id) => ({ id, reflectionText: `Words for ${id}\nmore` }))
);
vi.mock("@/lib/browse", () => ({ fetchMomentsByIds }));

// expo-file-system: every download "succeeds" into a fake cache path.
vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    exists = true;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri)).join("/");
    }
    create() {}
    delete() {}
    list() {
      return [];
    }
  }
  class File {
    uri: string;
    exists = false;
    size = 0;
    name: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
      this.name = name;
    }
    static downloadFileAsync = vi.fn(async () => ({}));
    delete() {}
  }
  return { Directory, File, Paths: { cache: { uri: "file:///cache" } } };
});

const {
  syncMemoryWidget,
  refreshMemoryWidget,
  clearMemoryWidget,
  wordsAllowed,
  buildWidgetPayload,
  browseToWidgetSource,
  artworkFileName,
  WIDGET_SCHEMA_VERSION,
} = await import("../widgetData");
const { widgetKeys } = await import("../widgetSettings");

const USER = "user-1";
const moments = [
  { id: "a", momentDate: "2023-11-23", songTitle: "A", songArtist: "AA", artworkUrl: "https://is1-ssl.mzstatic.com/a/600x600bb.jpg" },
  { id: "b", momentDate: "2024-01-05", songTitle: "B", songArtist: "BB", artworkUrl: "" },
  { id: "c", momentDate: "2024-02-05", songTitle: "C", songArtist: "CC", artworkUrl: "" },
];

function lastPayload() {
  const call = native.writeWidgetData.mock.calls.at(-1);
  return call ? JSON.parse(call[0]) : null;
}

beforeEach(async () => {
  storage.reset();
  vi.clearAllMocks();
  native.writeWidgetData.mockImplementation(async () => true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 23, 9, 0));
  await clearMemoryWidget();
  // Let the follow-up wipe it queues run before counting calls.
  await new Promise((r) => setTimeout(r, 0));
  vi.clearAllMocks();
});

describe("wordsAllowed", () => {
  it("needs the setting on and the lock off", () => {
    expect(wordsAllowed(true, false)).toBe(true);
    expect(wordsAllowed(true, true)).toBe(false);
    expect(wordsAllowed(false, false)).toBe(false);
  });
});

describe("buildWidgetPayload", () => {
  const pick = {
    day: "2026-11-23",
    momentId: "a",
    title: "A",
    artist: "AA",
    dateLabel: "3 years ago today",
    dateText: "November 23, 2023",
    onThisDay: true,
    line: "Words",
    artworkUrl: "https://x/300x300bb.jpg",
  };

  it("is versioned and names only artwork that was downloaded", () => {
    const name = artworkFileName("a", pick.artworkUrl);
    const with_ = buildWidgetPayload([pick], true, { [name]: "file:///cache/x" }, new Date(0));
    expect(with_.version).toBe(WIDGET_SCHEMA_VERSION);
    expect(with_.entries[0].image).toBe(name);
    expect(buildWidgetPayload([pick], true, {}, new Date(0)).entries[0].image).toBeNull();
  });

  it("drops the line when words aren't allowed", () => {
    expect(buildWidgetPayload([pick], false, {}, new Date(0)).entries[0].line).toBeNull();
    expect(buildWidgetPayload([pick], true, {}, new Date(0)).entries[0].line).toBe("Words");
  });

  it("names artwork by moment and URL, so new artwork gets a new file", () => {
    expect(artworkFileName("a", "u1")).not.toBe(artworkFileName("a", "u2"));
    expect(artworkFileName("a", "u1")).toMatch(/^a-[0-9a-z]+\.jpg$/);
  });
});

describe("browseToWidgetSource", () => {
  it("maps the Journal's library rows", () => {
    const [m] = browseToWidgetSource([
      { id: "x", moods: [], people: [], momentDate: "2024-01-01", songTitle: "T", songArtist: "R", songAlbumName: "", songArtworkUrl: "u" },
    ]);
    expect(m).toEqual({ id: "x", momentDate: "2024-01-01", songTitle: "T", songArtist: "R", artworkUrl: "u" });
  });
});

describe("syncMemoryWidget", () => {
  it("writes the week without words by default and reloads the widget", async () => {
    await syncMemoryWidget(USER, moments);
    const payload = lastPayload();
    expect(payload.showWords).toBe(false);
    expect(payload.entries[0]).toMatchObject({ day: "2026-11-23", momentId: "a", dateLabel: "3 years ago today", line: null });
    expect(fetchMomentsByIds).not.toHaveBeenCalled();
    expect(native.reloadWidgets).toHaveBeenCalledTimes(1);
    // Remembers the plan for next time's "shown recently".
    const record = JSON.parse(storage.map.get(widgetKeys(USER).shown)!);
    expect(record.planned["2026-11-23"]).toBe("a");
  });

  it("adds the first line of each reflection when words are on", async () => {
    storage.seed(widgetKeys(USER).words, "1");
    await syncMemoryWidget(USER, moments);
    const payload = lastPayload();
    expect(payload.showWords).toBe(true);
    expect(payload.entries[0].line).toBe("Words for a");
  });

  it("never shows words with the app lock on", async () => {
    storage.seed(widgetKeys(USER).words, "1");
    storage.seed("app_lock_enabled", "1");
    await syncMemoryWidget(USER, moments);
    const payload = lastPayload();
    expect(payload.showWords).toBe(false);
    expect(payload.entries.every((e: { line: string | null }) => e.line === null)).toBe(true);
    expect(fetchMomentsByIds).not.toHaveBeenCalled();
  });

  it("doesn't rewrite an identical week", async () => {
    await syncMemoryWidget(USER, moments);
    await syncMemoryWidget(USER, [...moments]);
    expect(native.writeWidgetData).toHaveBeenCalledTimes(1);
  });

  it("rewrites when the library changes what's shown", async () => {
    await syncMemoryWidget(USER, moments);
    await syncMemoryWidget(USER, moments.slice(1));
    expect(native.writeWidgetData).toHaveBeenCalledTimes(2);
  });

  it("does nothing more on a binary without the native writer", async () => {
    native.writeWidgetData.mockResolvedValue(false);
    await syncMemoryWidget(USER, moments);
    expect(native.reloadWidgets).not.toHaveBeenCalled();
    expect(storage.map.has(widgetKeys(USER).shown)).toBe(false);
  });
});

describe("refreshMemoryWidget", () => {
  it("does nothing before the Journal has handed over a library", async () => {
    await refreshMemoryWidget({ force: true });
    expect(native.writeWidgetData).not.toHaveBeenCalled();
  });

  it("is throttled on the same day, but not when forced or on a new day", async () => {
    await syncMemoryWidget(USER, moments);
    await refreshMemoryWidget();
    expect(native.writeWidgetData).toHaveBeenCalledTimes(1);
    await refreshMemoryWidget({ force: true });
    expect(native.writeWidgetData).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date(2026, 10, 24, 9, 0));
    await refreshMemoryWidget();
    expect(native.writeWidgetData).toHaveBeenCalledTimes(3);
    expect(lastPayload().entries[0].day).toBe("2026-11-24");
  });

  it("picks up a words setting turned on", async () => {
    await syncMemoryWidget(USER, moments);
    storage.seed(widgetKeys(USER).words, "1");
    await refreshMemoryWidget({ force: true });
    expect(lastPayload().showWords).toBe(true);
  });
});

describe("clearMemoryWidget", () => {
  it("wipes the file, reloads the widget and forgets the library", async () => {
    await syncMemoryWidget(USER, moments);
    await clearMemoryWidget();
    expect(native.clearWidgetData).toHaveBeenCalled();
    expect(native.reloadWidgets).toHaveBeenCalled();
    native.writeWidgetData.mockClear();
    await refreshMemoryWidget({ force: true });
    expect(native.writeWidgetData).not.toHaveBeenCalled();
  });

  it("stops a run already under way from writing", async () => {
    storage.seed(widgetKeys(USER).words, "1");
    let release!: () => void;
    fetchMomentsByIds.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([])))
    );
    const running = syncMemoryWidget(USER, moments);
    await vi.waitFor(() => expect(fetchMomentsByIds).toHaveBeenCalled());
    await clearMemoryWidget();
    release();
    await running;
    expect(native.writeWidgetData).not.toHaveBeenCalled();
  });
});
