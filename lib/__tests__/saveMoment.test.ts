/**
 * Create and edit share one save path. What matters here is what happens
 * around the database write: which photos get cleaned up when it fails, and
 * when the stored preview URL is left alone.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Song } from "@/types";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});

const mocks = vi.hoisted(() => ({
  uploadMomentPhotos: vi.fn(),
  deleteMomentPhotos: vi.fn(async () => []),
  fetchPreviewUrl: vi.fn(async () => "https://audio/preview.m4a"),
}));

vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("@sentry/react-native", () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "moment-1" }));
vi.mock("@/lib/providers", () => ({
  getProvider: () => ({ fetchPreviewUrl: mocks.fetchPreviewUrl }),
}));
vi.mock("@/lib/albums", () => ({ addMomentToAlbum: vi.fn(async () => {}) }));
vi.mock("@/lib/storage", () => ({
  uploadMomentPhotos: mocks.uploadMomentPhotos,
  deleteMomentPhotos: mocks.deleteMomentPhotos,
}));

import { saveMoment, updateMoment, type UpdateMomentInput } from "../saveMoment";

const song: Song = {
  id: "1",
  title: "Lovely Day",
  artistName: "Bill Withers",
  albumName: "Menagerie",
  artworkUrl: "https://is1-ssl.mzstatic.com/x/600x600bb.jpg",
  provider: "apple_music",
  appleMusicId: "1",
  spotifyId: null,
  durationMs: 0,
};

const base = {
  userId: "u1",
  song,
  reflection: "hi",
  moods: [],
  people: [],
  locationResult: null,
  momentDate: null,
};

const row = (over: Record<string, unknown> = {}) => ({
  id: "moment-1",
  user_id: "u1",
  song_title: song.title,
  song_artist: song.artistName,
  photo_urls: [],
  photo_thumbnails: [],
  ...over,
});

const NEW = { photoPaths: ["u1/new.jpg"], thumbnailPaths: ["u1/thumb_new.jpg"] };

beforeEach(() => {
  sb.reset();
  mocks.uploadMomentPhotos.mockReset();
  mocks.uploadMomentPhotos.mockResolvedValue(NEW);
  mocks.deleteMomentPhotos.mockClear();
  mocks.fetchPreviewUrl.mockClear();
});

const writeOf = (method: "insert" | "update") =>
  sb.queries.flatMap((q) => q.chain).find((c) => c.method === method)!.args[0] as Record<string, unknown>;

describe("saveMoment", () => {
  it("doesn't wait for a pending preview lookup before uploading photos", async () => {
    let resolvePreview!: (v: { previewUrl: string; albumName: null }) => void;
    const pending = new Promise<{ previewUrl: string; albumName: null }>((r) => (resolvePreview = r));
    sb.queueData(row());

    const saving = saveMoment({ ...base, photos: ["file:///a.jpg"], prefetchedPreview: pending });
    await Promise.resolve();
    expect(mocks.uploadMomentPhotos).toHaveBeenCalledTimes(1);

    resolvePreview({ previewUrl: "https://audio/p.m4a", albumName: null });
    await saving;
    expect(writeOf("insert").song_preview_url).toBe("https://audio/p.m4a");
  });

  it("saves without a preview when the pending lookup fails", async () => {
    sb.queueData(row());
    await saveMoment({ ...base, photos: [], prefetchedPreview: Promise.reject(new Error("timeout")) });
    expect(writeOf("insert").song_preview_url).toBeNull();
  });

  it("deletes the uploaded photos when the insert is confirmed not to have landed", async () => {
    sb.queueError("network");
    sb.queueData(null); // read-back: no row

    await expect(saveMoment({ ...base, photos: ["file:///a.jpg"] })).rejects.toMatchObject({
      message: "network",
    });
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledWith(NEW.photoPaths, NEW.thumbnailPaths);
  });

  it("treats an insert that landed despite the error as saved", async () => {
    sb.queueError("network");
    sb.queueData(row({ photo_urls: NEW.photoPaths }));

    const result = await saveMoment({ ...base, photos: ["file:///a.jpg"] });
    expect(result.id).toBe("moment-1");
    expect(mocks.deleteMomentPhotos).not.toHaveBeenCalled();
  });

  it("keeps the photos when it can't tell whether the insert landed", async () => {
    sb.queueError("network");
    sb.queueError("still offline");

    await expect(saveMoment({ ...base, photos: ["file:///a.jpg"] })).rejects.toBeTruthy();
    expect(mocks.deleteMomentPhotos).not.toHaveBeenCalled();
  });
});

const edit = (over: Partial<UpdateMomentInput> = {}): UpdateMomentInput => ({
  ...base,
  momentId: "moment-1",
  originalSong: song,
  originalPhotos: ["u1/old1.jpg", "u1/old2.jpg"],
  originalThumbnails: ["u1/thumb_old1.jpg", "u1/thumb_old2.jpg"],
  keptPhotos: ["u1/old1.jpg"],
  keptThumbnails: ["u1/thumb_old1.jpg"],
  newPhotos: ["file:///a.jpg"],
  ...over,
});

describe("updateMoment", () => {
  it("leaves the stored preview alone when the song didn't change", async () => {
    sb.queueData(row());
    await updateMoment(edit());

    expect(mocks.fetchPreviewUrl).not.toHaveBeenCalled();
    expect(writeOf("update")).not.toHaveProperty("song_preview_url");
  });

  it("replaces the preview when the song changed", async () => {
    sb.queueData(row());
    await updateMoment(edit({ song: { ...song, appleMusicId: "2", title: "Other" } }));

    expect(mocks.fetchPreviewUrl).toHaveBeenCalledTimes(1);
    expect(writeOf("update").song_preview_url).toBe("https://audio/preview.m4a");
  });

  it("writes kept then new photos, clears coordinates with the place, and deletes removed photos", async () => {
    sb.queueData(row());
    await updateMoment(edit());

    expect(writeOf("update")).toMatchObject({
      photo_urls: ["u1/old1.jpg", "u1/new.jpg"],
      photo_thumbnails: ["u1/thumb_old1.jpg", "u1/thumb_new.jpg"],
      location: null,
      location_lat: null,
      location_lng: null,
    });
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledWith(["u1/old2.jpg"], ["u1/thumb_old2.jpg"]);
  });

  it("on a failed update, deletes the new uploads and keeps the removed originals", async () => {
    sb.queueError("network");
    sb.queueData(row({ photo_urls: ["u1/old1.jpg", "u1/old2.jpg"] }));

    await expect(updateMoment(edit())).rejects.toMatchObject({ message: "network" });
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledWith([...NEW.photoPaths, ...NEW.thumbnailPaths]);
  });

  it("treats an update that landed despite the error as saved", async () => {
    sb.queueError("network");
    sb.queueData(
      row({
        photo_urls: ["u1/old1.jpg", "u1/new.jpg"],
        photo_thumbnails: ["u1/thumb_old1.jpg", "u1/thumb_new.jpg"],
      })
    );

    const moment = await updateMoment(edit());
    expect(moment.photoUrls).toEqual(["u1/old1.jpg", "u1/new.jpg"]);
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledWith(["u1/old2.jpg"], ["u1/thumb_old2.jpg"]);
  });
});
