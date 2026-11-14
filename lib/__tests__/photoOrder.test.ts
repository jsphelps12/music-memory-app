/**
 * The edit screen's strip order is the saved order: stored and new photos
 * interleave however the user dragged them, and each photo keeps its own
 * thumbnail.
 */
import { describe, it, expect } from "vitest";
import {
  buildPhotoColumns,
  newPhotoUris,
  pairStoredPhotos,
  type EditedPhoto,
} from "../photoOrder";

const kept = (n: number, thumb = true): EditedPhoto => ({
  kind: "kept",
  path: `u1/old${n}.jpg`,
  thumb: thumb ? `u1/thumb_old${n}.jpg` : null,
});
const added = (n: number): EditedPhoto => ({ kind: "new", uri: `file:///new${n}.jpg` });
const uploads = (...ns: number[]) => ({
  photoPaths: ns.map((n) => `u1/new${n}.jpg`),
  thumbnailPaths: ns.map((n) => `u1/thumb_new${n}.jpg`),
});
const original = (...ns: number[]) => ({
  photos: ns.map((n) => `u1/old${n}.jpg`),
  thumbnails: ns.map((n) => `u1/thumb_old${n}.jpg`),
});
const legacy = (...ns: number[]) => ({ photos: ns.map((n) => `u1/old${n}.jpg`), thumbnails: [] });

describe("newPhotoUris", () => {
  it("lists only new photos, in strip order", () => {
    expect(newPhotoUris([added(2), kept(1), added(1)])).toEqual(["file:///new2.jpg", "file:///new1.jpg"]);
  });
});

describe("buildPhotoColumns", () => {
  it("saves stored and new photos interleaved in strip order, thumbnails paired", () => {
    const result = buildPhotoColumns([added(1), kept(2), added(2), kept(1)], uploads(1, 2), original(1, 2));
    expect(result.photo_urls).toEqual(["u1/new1.jpg", "u1/old2.jpg", "u1/new2.jpg", "u1/old1.jpg"]);
    expect(result.photo_thumbnails).toEqual([
      "u1/thumb_new1.jpg",
      "u1/thumb_old2.jpg",
      "u1/thumb_new2.jpg",
      "u1/thumb_old1.jpg",
    ]);
    expect(result.removed).toEqual({ photos: [], thumbnails: [] });
  });

  it("keeps a reorder of stored photos with nothing added", () => {
    const result = buildPhotoColumns([kept(3), kept(1), kept(2)], uploads(), original(1, 2, 3));
    expect(result.photo_urls).toEqual(["u1/old3.jpg", "u1/old1.jpg", "u1/old2.jpg"]);
    expect(result.photo_thumbnails).toEqual(["u1/thumb_old3.jpg", "u1/thumb_old1.jpg", "u1/thumb_old2.jpg"]);
    expect(result.removed).toEqual({ photos: [], thumbnails: [] });
  });

  it("saves all-new photos in strip order on a moment that had none", () => {
    const result = buildPhotoColumns([added(1), added(2)], uploads(1, 2), { photos: [], thumbnails: [] });
    expect(result.photo_urls).toEqual(["u1/new1.jpg", "u1/new2.jpg"]);
    expect(result.photo_thumbnails).toEqual(["u1/thumb_new1.jpg", "u1/thumb_new2.jpg"]);
  });

  it("reports removed photos and their thumbnails for storage cleanup", () => {
    const result = buildPhotoColumns([added(1), kept(2)], uploads(1), original(1, 2, 3));
    expect(result.photo_urls).toEqual(["u1/new1.jpg", "u1/old2.jpg"]);
    expect(result.removed).toEqual({
      photos: ["u1/old1.jpg", "u1/old3.jpg"],
      thumbnails: ["u1/thumb_old1.jpg", "u1/thumb_old3.jpg"],
    });
  });

  it("removing every photo writes empty arrays and removes them all", () => {
    const result = buildPhotoColumns([], uploads(), original(1));
    expect(result).toEqual({
      photo_urls: [],
      photo_thumbnails: [],
      removed: { photos: ["u1/old1.jpg"], thumbnails: ["u1/thumb_old1.jpg"] },
    });
  });

  it("keeps thumbnails empty on a legacy moment with nothing added", () => {
    const result = buildPhotoColumns([kept(2, false), kept(1, false)], uploads(), legacy(1, 2, 3));
    expect(result.photo_urls).toEqual(["u1/old2.jpg", "u1/old1.jpg"]);
    expect(result.photo_thumbnails).toEqual([]);
    expect(result.removed).toEqual({ photos: ["u1/old3.jpg"], thumbnails: [] });
  });

  it("on a legacy moment with a photo added, a stored photo stands in as its own thumbnail", () => {
    const result = buildPhotoColumns([kept(1, false), added(1), kept(2, false)], uploads(1), legacy(1, 2));
    expect(result.photo_urls).toEqual(["u1/old1.jpg", "u1/new1.jpg", "u1/old2.jpg"]);
    // Index-paired, so the card strip shows all three, not just the new one.
    expect(result.photo_thumbnails).toEqual(["u1/old1.jpg", "u1/thumb_new1.jpg", "u1/old2.jpg"]);
    expect(result.removed).toEqual({ photos: [], thumbnails: [] });
  });

  it("throws rather than drop a new photo the uploads don't cover", () => {
    expect(() => buildPhotoColumns([kept(1), added(1), added(2)], uploads(1), original(1))).toThrow(
      /1 of 2/
    );
  });
});

describe("pairStoredPhotos", () => {
  it("pairs equal-length arrays by index", () => {
    expect(pairStoredPhotos(["u1/a.jpg", "u1/b.jpg"], ["u1/thumb_a.jpg", "u1/thumb_b.jpg"])).toEqual([
      { path: "u1/a.jpg", thumb: "u1/thumb_a.jpg" },
      { path: "u1/b.jpg", thumb: "u1/thumb_b.jpg" },
    ]);
  });

  it("gives legacy photos no thumbnail", () => {
    expect(pairStoredPhotos(["u1/a.jpg"], [])).toEqual([{ path: "u1/a.jpg", thumb: null }]);
  });

  it("pairs by name when an older edit left the arrays different lengths", () => {
    // Legacy photos a, b plus a photo c added by the old kept-then-new save.
    expect(pairStoredPhotos(["u1/a.jpg", "u1/b.jpg", "u1/c.jpg"], ["u1/thumb_c.jpg"])).toEqual([
      { path: "u1/a.jpg", thumb: null },
      { path: "u1/b.jpg", thumb: null },
      { path: "u1/c.jpg", thumb: "u1/thumb_c.jpg" },
    ]);
  });
});
