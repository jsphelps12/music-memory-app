/**
 * A draft's photos must still be there when it's continued: after iOS clears
 * the picker's cache, and after an app update moves the app's folders. These
 * cover the pure rules; the file work is in lib/captureDraftFiles.ts.
 */
import { describe, it, expect, vi } from "vitest";
import {
  storedUri,
  liveUri,
  keptFolder,
  keptName,
  needsKeptCopy,
  keptFileNames,
  photoCountLabel,
  resolveDraftPhotos,
  type DraftPhoto,
} from "../draftPhotos";

const OLD = {
  document: "file:///var/mobile/Containers/Data/Application/OLD/Documents/",
  cache: "file:///var/mobile/Containers/Data/Application/OLD/Library/Caches/",
};
const NEW = {
  document: "file:///var/mobile/Containers/Data/Application/NEW/Documents",
  cache: "file:///var/mobile/Containers/Data/Application/NEW/Library/Caches",
};

describe("stored URIs", () => {
  it("keeps files in the app's folders relative, so an update moving the container doesn't lose them", () => {
    const picked = `${OLD.cache}ImagePicker/ABC.jpg`;
    const stored = storedUri(picked, OLD);
    expect(stored).toBe("cache:ImagePicker/ABC.jpg");
    expect(liveUri(stored, NEW)).toBe("file:///var/mobile/Containers/Data/Application/NEW/Library/Caches/ImagePicker/ABC.jpg");
    expect(storedUri(`${OLD.document}capture-drafts/u/d/x.jpg`, OLD)).toBe("doc:capture-drafts/u/d/x.jpg");
  });

  it("treats /private/var and /var as the same place", () => {
    expect(storedUri("file:///private/var/mobile/Containers/Data/Application/OLD/Library/Caches/a.jpg", OLD)).toBe("cache:a.jpg");
  });

  it("leaves a file elsewhere as it is", () => {
    const photos = "file:///var/mobile/Media/DCIM/100APPLE/IMG_0001.HEIC";
    expect(storedUri(photos, OLD)).toBe(photos);
    expect(liveUri(photos, NEW)).toBe(photos);
  });
});

describe("kept copies", () => {
  it("names a copy after its source, the same each time and different per source", () => {
    expect(keptName("cache:ImagePicker/ABC.jpg")).toBe(keptName("cache:ImagePicker/ABC.jpg"));
    expect(keptName("cache:share/a/IMG_0001.jpg")).not.toBe(keptName("cache:share/b/IMG_0001.jpg"));
    expect(keptName("cache:x/photo.HEIC")).toMatch(/^[a-z0-9]+\.heic$/);
    expect(keptName("cache:x/noext")).toMatch(/\.jpg$/);
  });

  it("copies only what has no library id and isn't already kept", () => {
    const folder = keptFolder("u1", "d1");
    expect(needsKeptCopy({ uri: "cache:ImagePicker/cam.jpg" }, folder)).toBe(true);
    expect(needsKeptCopy({ uri: "cache:ImagePicker/lib.jpg", assetId: "A1" }, folder)).toBe(false);
    expect(needsKeptCopy({ uri: `${folder}abc.jpg` }, folder)).toBe(false);
    // A copy kept by a different draft gets its own.
    expect(needsKeptCopy({ uri: `${keptFolder("u1", "other")}abc.jpg` }, folder)).toBe(true);
  });

  it("lists each draft's kept copies, for cleanup", () => {
    const names = keptFileNames(
      [
        { id: "d1", photos: [{ uri: `${keptFolder("u1", "d1")}a.jpg` }, { uri: "cache:lib.jpg", assetId: "A1" }] },
        { id: "d2", photos: [{ uri: "cache:lib.jpg", assetId: "A1" }] },
        { id: "d3" },
      ],
      "u1"
    );
    expect([...names.entries()]).toEqual([["d1", new Set(["a.jpg"])]]);
  });
});

describe("photoCountLabel", () => {
  it("says how many photos and videos", () => {
    expect(photoCountLabel(undefined)).toBe("");
    expect(photoCountLabel([{ uri: "a" }])).toBe("1 photo");
    expect(photoCountLabel([{ uri: "a" }, { uri: "b" }])).toBe("2 photos");
    expect(photoCountLabel([{ uri: "a", videoMs: 3000 }])).toBe("1 video");
    expect(photoCountLabel([{ uri: "a" }, { uri: "b" }, { uri: "c", videoMs: 3000 }])).toBe("2 photos, 1 video");
  });
});

describe("resolveDraftPhotos", () => {
  const deps = (present: string[], relinked: Record<string, { uri: string; videoMs?: number }> = {}) => ({
    live: (stored: string) => liveUri(stored, NEW),
    exists: (uri: string) => present.includes(uri),
    relink: vi.fn(async (p: DraftPhoto) => (p.assetId ? relinked[p.assetId] ?? null : null)),
  });

  it("keeps files that are still there, in order, as files in this install", async () => {
    const live = `${NEW.document}/capture-drafts/u/d/a.jpg`;
    const d = deps([live, "file:///elsewhere.jpg"]);
    const out = await resolveDraftPhotos([{ uri: "doc:capture-drafts/u/d/a.jpg" }, { uri: "file:///elsewhere.jpg", assetId: "A1" }], d);
    expect(out).toEqual([{ uri: live }, { uri: "file:///elsewhere.jpg", assetId: "A1" }]);
    expect(d.relink).not.toHaveBeenCalled();
  });

  it("finds a cleared photo again by its library id, and a video as a new poster", async () => {
    const d = deps([], { A1: { uri: "file:///photos/IMG.HEIC" }, V1: { uri: "file:///tmp/poster2.jpg", videoMs: 9000 } });
    const out = await resolveDraftPhotos(
      [
        { uri: "cache:ImagePicker/gone.jpg", assetId: "A1" },
        { uri: "file:///tmp/poster.jpg", assetId: "V1", videoMs: 9000 },
      ],
      d
    );
    expect(out).toEqual([
      { uri: "file:///photos/IMG.HEIC", assetId: "A1", videoMs: null },
      { uri: "file:///tmp/poster2.jpg", assetId: "V1", videoMs: 9000 },
    ]);
  });

  it("leaves out one whose file is gone with no library id, or whose id no longer resolves", async () => {
    const d = deps(["file:///kept.jpg"]);
    d.relink.mockRejectedValueOnce(new Error("no access"));
    const out = await resolveDraftPhotos(
      [{ uri: "cache:gone.jpg" }, { uri: "cache:deleted.jpg", assetId: "GONE" }, { uri: "file:///kept.jpg" }, { uri: "cache:x.jpg", assetId: "ERR" }],
      d
    );
    expect(out).toEqual([{ uri: "file:///kept.jpg" }]);
  });

  it("never brings the same file back twice", async () => {
    const out = await resolveDraftPhotos([{ uri: "file:///a.jpg" }, { uri: "file:///a.jpg" }], deps(["file:///a.jpg"]));
    expect(out).toHaveLength(1);
  });
});
