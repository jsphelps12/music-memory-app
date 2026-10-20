import { describe, expect, it } from "vitest";
import { findOrphans, normalizePath, objectKind, referencedPaths } from "../orphans.mjs";

const OLD = "2026-01-01T00:00:00Z";
const NOW = Date.parse("2026-10-20T00:00:00Z");
const obj = (path, created = OLD) => ({ path, size: 1, created });

describe("referencedPaths", () => {
  it("keeps the full-size avatar next to a referenced avatar.jpg", () => {
    const ref = referencedPaths({
      moments: [],
      profiles: [{ avatar_url: "u1/avatar.jpg" }, { avatar_url: null }],
      collections: [],
    });
    expect(ref.has("u1/avatar.jpg")).toBe(true);
    expect(ref.has("u1/avatar_full.jpg")).toBe(true);
  });

  it("keeps a photo and its thumbnail together even when photo_thumbnails is empty", () => {
    const ref = referencedPaths({
      moments: [{ photo_urls: ["u1/a.jpg"], photo_thumbnails: null }],
      profiles: [],
      collections: [],
    });
    expect(ref.has("u1/a.jpg")).toBe(true);
    expect(ref.has("u1/thumb_a.jpg")).toBe(true);
  });

  it("reads album covers and guest photos", () => {
    const ref = referencedPaths({
      moments: [{ photo_urls: ["guest/g1/p.jpg"], photo_thumbnails: [] }],
      profiles: [],
      collections: [{ cover_photo_url: "u1/collection_covers/c1.jpg" }],
    });
    expect(ref.has("guest/g1/p.jpg")).toBe(true);
    expect(ref.has("u1/collection_covers/c1.jpg")).toBe(true);
  });
});

describe("normalizePath", () => {
  it("accepts a bare path, a leading slash or a public URL", () => {
    expect(normalizePath("u1/a.jpg")).toBe("u1/a.jpg");
    expect(normalizePath("/u1/a.jpg")).toBe("u1/a.jpg");
    expect(normalizePath("https://x.supabase.co/storage/v1/object/public/moment-photos/u1/a.jpg?v=2")).toBe(
      "u1/a.jpg"
    );
  });
  it("ignores empty values and other hosts", () => {
    expect(normalizePath("")).toBeNull();
    expect(normalizePath(null)).toBeNull();
    expect(normalizePath("https://is1-ssl.mzstatic.com/art.jpg")).toBeNull();
  });
});

describe("findOrphans", () => {
  const referenced = referencedPaths({
    moments: [{ photo_urls: ["u1/a.jpg"], photo_thumbnails: ["u1/thumb_a.jpg"] }],
    profiles: [{ avatar_url: "u1/avatar.jpg" }],
    collections: [],
  });

  it("never returns a live photo, thumbnail or avatar", () => {
    const objects = ["u1/a.jpg", "u1/thumb_a.jpg", "u1/avatar.jpg", "u1/avatar_full.jpg", "u1/gone.jpg"].map((p) =>
      obj(p)
    );
    expect(findOrphans(objects, referenced, { now: NOW }).map((o) => o.path)).toEqual(["u1/gone.jpg"]);
  });

  it("keeps recent objects and objects of unknown age", () => {
    const objects = [obj("u1/new.jpg", "2026-10-19T23:00:00Z"), obj("u1/unknown.jpg", null)];
    expect(findOrphans(objects, referenced, { now: NOW })).toEqual([]);
  });
});

describe("objectKind", () => {
  it("labels the main kinds", () => {
    expect(objectKind("u1/avatar_full.jpg")).toBe("avatar");
    expect(objectKind("u1/thumb_a.jpg")).toBe("thumbnail");
    expect(objectKind("u1/collection_covers/c.jpg")).toBe("album cover");
    expect(objectKind("guest/g/p.jpg")).toBe("guest photo");
    expect(objectKind("u1/a.jpg")).toBe("photo");
  });
});
