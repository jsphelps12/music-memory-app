import { describe, expect, it } from "vitest";
import {
  applyStarter,
  deviceId,
  forgetMoment,
  formatEventDate,
  newEditToken,
  markPhoto,
  parseGuestOccasion,
  parseSearch,
  rememberedName,
  rememberName,
  saveMoment,
  savedMoments,
  type SavedMoment,
} from "../occasionGuest";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const throwingStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceeded");
  },
};

describe("parseGuestOccasion", () => {
  const good = {
    slug: "sam-and-priya",
    names: "Sam & Priya",
    eventDate: "2027-06-14",
    city: "Hudson, NY",
    status: "collecting",
    accepting: true,
    suggestedSongs: [
      { appleMusicId: "4433", title: "September", artist: "Earth, Wind & Fire", artworkUrl: "https://x/a.jpg" },
      { appleMusicId: "not-a-number", title: "Bad", artist: "Id" },
      { appleMusicId: 77, title: "", artist: "No title" },
    ],
    bookToken: null,
  };

  it("keeps what a guest needs and drops bad suggestions", () => {
    const o = parseGuestOccasion(good);
    expect(o?.names).toBe("Sam & Priya");
    expect(o?.accepting).toBe(true);
    expect(o?.suggestedSongs.map((s) => s.title)).toEqual(["September"]);
  });

  it("is null for missing or malformed occasions", () => {
    expect(parseGuestOccasion(null)).toBeNull();
    expect(parseGuestOccasion({ ...good, eventDate: "June 14" })).toBeNull();
    expect(parseGuestOccasion({ ...good, names: "  " })).toBeNull();
  });

  it("keeps a well-formed book token only", () => {
    expect(parseGuestOccasion(good)?.bookToken).toBeNull();
    expect(parseGuestOccasion({ ...good, bookToken: "0123456789abcdef0123456789abcdef" })?.bookToken).toBe("0123456789abcdef0123456789abcdef");
    expect(parseGuestOccasion({ ...good, bookToken: "../evil" })?.bookToken).toBeNull();
  });

  it("treats anything but true as not accepting", () => {
    expect(parseGuestOccasion({ ...good, accepting: "yes" })?.accepting).toBe(false);
  });
});

describe("formatEventDate", () => {
  it("keeps the calendar day", () => {
    expect(formatEventDate("2027-06-14")).toBe("Monday, June 14, 2027");
  });
});

describe("applyStarter", () => {
  it("starts an empty note, or leads what's there", () => {
    expect(applyStarter("", "The night we met…")).toBe("The night we met ");
    expect(applyStarter("  at the lake ", "You two in…")).toBe("You two in at the lake");
  });

  it("swaps a starter that's already there instead of stacking", () => {
    expect(applyStarter("The night we met ", "The night we met…")).toBe("The night we met ");
    expect(applyStarter("The night we met at the lake", "Every summer…")).toBe("Every summer at the lake");
  });
});

describe("parseSearch", () => {
  it("keeps songs once each, with bigger artwork", () => {
    const results = parseSearch({
      results: [
        { kind: "song", trackId: 1, trackName: "Dreams", artistName: "Fleetwood Mac", collectionName: "Rumours", artworkUrl100: "https://a/100x100bb.jpg" },
        { kind: "song", trackId: 1, trackName: "Dreams", artistName: "Fleetwood Mac" },
        { kind: "music-video", trackId: 2, trackName: "Video", artistName: "X" },
        { kind: "song", trackId: 3, trackName: "", artistName: "Nobody" },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].artworkUrl).toBe("https://a/200x200bb.jpg");
    expect(results[0].album).toBe("Rumours");
  });

  it("is empty for junk", () => {
    expect(parseSearch(null)).toEqual([]);
    expect(parseSearch({ results: "nope" })).toEqual([]);
  });
});

describe("what the phone remembers", () => {
  const moment = (entryId: string): SavedMoment => ({
    entryId,
    editToken: "tok",
    title: "September",
    artist: "Earth, Wind & Fire",
    artworkUrl: null,
    hasPhoto: false,
    savedAt: "2027-06-14T22:00:00Z",
  });

  it("remembers the name and a stable device id", () => {
    const store = memoryStore();
    rememberName(store, "Aunt Linda");
    expect(rememberedName(store)).toBe("Aunt Linda");
    const id = deviceId(store, () => "abcd-1234-efgh");
    expect(deviceId(store, () => "something-else")).toBe(id);
  });

  it("keeps moments per guest book, newest first, and marks photos", () => {
    const store = memoryStore();
    saveMoment(store, "sam-and-priya", moment("a"));
    saveMoment(store, "sam-and-priya", moment("b"));
    saveMoment(store, "other-wedding", moment("c"));
    expect(savedMoments(store, "sam-and-priya").map((m) => m.entryId)).toEqual(["b", "a"]);
    markPhoto(store, "sam-and-priya", "a");
    expect(savedMoments(store, "sam-and-priya").find((m) => m.entryId === "a")?.hasPhoto).toBe(true);
  });

  it("forgets a removed moment, only on that guest book", () => {
    const store = memoryStore();
    saveMoment(store, "sam-and-priya", moment("a"));
    saveMoment(store, "sam-and-priya", moment("b"));
    saveMoment(store, "other-wedding", moment("a"));
    forgetMoment(store, "sam-and-priya", "a");
    expect(savedMoments(store, "sam-and-priya").map((m) => m.entryId)).toEqual(["b"]);
    expect(savedMoments(store, "other-wedding")).toHaveLength(1);
  });

  it("survives storage that throws", () => {
    expect(rememberedName(throwingStore)).toBe("");
    expect(savedMoments(throwingStore, "x")).toEqual([]);
    expect(() => saveMoment(throwingStore, "x", moment("a"))).not.toThrow();
    expect(deviceId(throwingStore, () => "fresh-device-id")).toBe("fresh-device-id");
  });
});

describe("newEditToken", () => {
  it("is 43 base64url characters, and random", () => {
    const token = newEditToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newEditToken()).not.toBe(token);
  });

  it("maps bytes that need +, / and = in base64 to url-safe output", () => {
    const token = newEditToken((b) => b.fill(0xff));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token.startsWith("_")).toBe(true);
  });
});
