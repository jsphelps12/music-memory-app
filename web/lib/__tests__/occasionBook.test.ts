import { describe, expect, it } from "vitest";
import { artworkAt, bookSummary, keepsakeView, momentWhen, mostPicked, parseBook } from "../occasionBook";

const moment = {
  id: "e1",
  guestName: "Mara",
  words: "First dance.",
  appleMusicId: "1",
  title: "September",
  artist: "Earth, Wind & Fire",
  album: null,
  artworkUrl: "https://is1-ssl.mzstatic.com/a/600x600bb.jpg",
  previewUrl: "https://audio-ssl.itunes.apple.com/p.m4a",
  photoUrl: "https://x.supabase.co/storage/v1/object/sign/p.jpg?token=t",
  createdAt: "2027-06-15T02:00:00Z",
};

describe("parseBook", () => {
  const good = { occasion: { names: "Sam & Priya", eventDate: "2027-06-14", city: "Hudson", timeZone: "America/New_York" }, moments: [moment] };

  it("keeps a well-formed book", () => {
    const b = parseBook(good);
    expect(b?.occasion.names).toBe("Sam & Priya");
    expect(b?.moments).toHaveLength(1);
  });

  it("drops malformed moments and non-https media", () => {
    const b = parseBook({ ...good, moments: [moment, { id: "x" }, { ...moment, id: "e2", photoUrl: "javascript:alert(1)", previewUrl: "http://a" }] });
    expect(b?.moments.map((m) => m.id)).toEqual(["e1", "e2"]);
    expect(b?.moments[1].photoUrl).toBeNull();
    expect(b?.moments[1].previewUrl).toBeNull();
  });

  it("is null without an occasion", () => {
    expect(parseBook(null)).toBeNull();
    expect(parseBook({ moments: [] })).toBeNull();
    expect(parseBook({ ...good, occasion: { ...good.occasion, eventDate: "June" } })).toBeNull();
  });
});

describe("mostPicked", () => {
  it("counts repeats, most first, ties by first pick", () => {
    const s = (appleMusicId: string, title: string) => ({ appleMusicId, title, artist: "A" });
    const picked = mostPicked([s("1", "September"), s("2", "Dancing Queen"), s("2", "Dancing Queen"), s("1", "September"), s("3", "Solo"), s("1", "September")]);
    expect(picked.map((p) => [p.title, p.count])).toEqual([["September", 3], ["Dancing Queen", 2]]);
  });

  it("is empty when every song is different", () => {
    expect(mostPicked([{ appleMusicId: "1", title: "A", artist: "B" }])).toEqual([]);
  });
});

describe("bookSummary", () => {
  it("counts songs and people", () => {
    expect(bookSummary([{ guestName: "Mara" }, { guestName: "mara " }, { guestName: "Leo" }])).toBe("3 songs from 2 people");
    expect(bookSummary([{ guestName: "Mara" }])).toBe("1 song from 1 person");
  });
});

describe("momentWhen", () => {
  it("shows the time on the night, including after midnight", () => {
    expect(momentWhen("2027-06-15T02:42:00Z", "2027-06-14", "America/New_York")).toBe("10:42 PM");
    expect(momentWhen("2027-06-15T05:10:00Z", "2027-06-14", "America/New_York")).toBe("1:10 AM");
  });

  it("shows the day otherwise", () => {
    expect(momentWhen("2027-06-20T15:00:00Z", "2027-06-14", "America/New_York")).toBe("Jun 20");
    expect(momentWhen("2027-06-15T14:00:00Z", "2027-06-14", "America/New_York")).toBe("Jun 15");
  });
});

describe("artworkAt", () => {
  it("resizes Apple artwork", () => {
    expect(artworkAt("https://is1-ssl.mzstatic.com/a/600x600bb.jpg", 1200)).toBe("https://is1-ssl.mzstatic.com/a/1200x1200bb.jpg");
    expect(artworkAt(null, 100)).toBeNull();
  });
});

describe("keepsakeView", () => {
  it("formats the header and each moment's time", () => {
    const v = keepsakeView({
      occasion: { names: "Sam & Priya", eventDate: "2027-06-14", city: "Hudson, NY", timeZone: "America/New_York" },
      moments: [moment, { ...moment, id: "e2", guestName: "Leo" }],
    });
    expect(v.when).toBe("Monday, June 14, 2027 · Hudson, NY");
    expect(v.summary).toBe("2 songs from 2 people");
    expect(v.moments[0].when).toBe("10:00 PM");
    expect(v.picked.map((p) => p.count)).toEqual([2]);
  });
});
