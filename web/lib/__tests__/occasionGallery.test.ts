import { describe, expect, it } from "vitest";
import { apartLabel, exifInstant, onTheNight, readExifTime, suggestMatches, zonedToUtc } from "../occasionGallery";

/** A minimal JPEG with an EXIF block: IFD0 → ExifIFD with DateTimeOriginal (and an offset). */
function jpegWithExif(wall: string, offset?: string, little = true): ArrayBuffer {
  const tiff: number[] = [];
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (little ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const str = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  // Header + IFD0 at 8 with one entry (ExifIFD pointer → 26).
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
  // ExifIFD at 26.
  const entries = offset ? 2 : 1;
  const dataAt = 26 + 2 + entries * 12 + 4;
  const wallBytes = str(wall);
  tiff.push(...u16(entries), ...u16(0x9003), ...u16(2), ...u32(wallBytes.length), ...u32(dataAt));
  if (offset) tiff.push(...u16(0x9011), ...u16(2), ...u32(7), ...u32(dataAt + wallBytes.length));
  tiff.push(...u32(0), ...wallBytes);
  if (offset) tiff.push(...str(offset));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xd9]).buffer;
}

describe("readExifTime", () => {
  it("reads DateTimeOriginal, little and big endian", () => {
    expect(readExifTime(jpegWithExif("2027:06:14 22:42:11"))).toEqual({ wall: "2027:06:14 22:42:11", offset: null });
    expect(readExifTime(jpegWithExif("2027:06:14 22:42:11", undefined, false))?.wall).toBe("2027:06:14 22:42:11");
  });

  it("reads the camera's offset when there is one", () => {
    expect(readExifTime(jpegWithExif("2027:06:14 22:42:11", "-04:00"))?.offset).toBe("-04:00");
  });

  it("is null for non-JPEGs and JPEGs without EXIF", () => {
    expect(readExifTime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(readExifTime(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]).buffer)).toBeNull();
    expect(readExifTime(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 1, 2]).buffer)).toBeNull();
  });
});

describe("times", () => {
  it("reads a wall clock in the wedding's zone, across DST", () => {
    expect(zonedToUtc({ y: 2027, mo: 6, d: 14, h: 22, mi: 42, s: 0 }, "America/New_York").toISOString()).toBe("2027-06-15T02:42:00.000Z");
    expect(zonedToUtc({ y: 2027, mo: 1, d: 14, h: 22, mi: 42, s: 0 }, "America/New_York").toISOString()).toBe("2027-01-15T03:42:00.000Z");
  });

  it("prefers the camera's own offset", () => {
    expect(exifInstant({ wall: "2027:06:14 22:42:00", offset: "+01:00" }, "America/New_York")?.toISOString()).toBe("2027-06-14T21:42:00.000Z");
    expect(exifInstant({ wall: "2027:13:14 22:42:00", offset: null }, "America/New_York")).toBeNull();
  });

  it("knows the wedding night", () => {
    expect(onTheNight("2027-06-15T02:42:00Z", "2027-06-14", "America/New_York")).toBe(true);
    expect(onTheNight("2027-06-15T08:00:00Z", "2027-06-14", "America/New_York")).toBe(true);
    expect(onTheNight("2027-06-15T12:00:00Z", "2027-06-14", "America/New_York")).toBe(false);
  });
});

describe("suggestMatches", () => {
  const opts = { eventDate: "2027-06-14", timeZone: "America/New_York" };
  const at = (hhmm: string) => `2027-06-15T${hhmm}:00Z`; // the night, in UTC

  it("pairs closest first and uses each photo once", () => {
    const s = suggestMatches(
      [{ id: "a", createdAt: at("02:00") }, { id: "b", createdAt: at("02:05") }],
      [{ id: "p1", takenAt: at("02:04") }, { id: "p2", takenAt: at("01:50") }],
      opts
    );
    expect(s.find((x) => x.entryId === "b")?.photoId).toBe("p1");
    expect(s.find((x) => x.entryId === "a")?.photoId).toBe("p2");
    expect(s.find((x) => x.entryId === "a")?.minutesApart).toBe(-10);
  });

  it("suggests nothing outside the window or off the night", () => {
    const s = suggestMatches(
      [{ id: "a", createdAt: at("02:00") }, { id: "later", createdAt: "2027-06-20T18:00:00Z" }],
      [{ id: "far", takenAt: at("03:30") }, { id: "untimed", takenAt: null }],
      opts
    );
    expect(s).toHaveLength(1);
    expect(s[0].photoId).toBeNull();
    expect(s[0].alternatives).toEqual(["far"]);
  });

  it("corrects a camera clock that was an hour off", () => {
    const s = suggestMatches([{ id: "a", createdAt: at("02:00") }], [{ id: "p", takenAt: at("01:00") }], { ...opts, clockShiftMinutes: 60 });
    expect(s[0].photoId).toBe("p");
  });

  it("skips photos already used", () => {
    const s = suggestMatches([{ id: "a", createdAt: at("02:00") }], [{ id: "p", takenAt: at("02:01") }], { ...opts, taken: new Set(["p"]) });
    expect(s[0].photoId).toBeNull();
  });
});

describe("apartLabel", () => {
  it("reads naturally", () => {
    expect(apartLabel(-4)).toBe("taken 4 minutes before they picked it");
    expect(apartLabel(1)).toBe("taken 1 minute after they picked it");
    expect(apartLabel(0)).toBe("taken right as they picked it");
  });
});
