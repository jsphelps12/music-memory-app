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
  /** The provider's catalog lookup; unset = a provider without one (Spotify). */
  lookupSong: undefined as undefined | ReturnType<typeof vi.fn>,
  uploadVoice: vi.fn(async (userId: string, momentId: string) => `${userId}/${momentId}-1.m4a`),
  deleteVoice: vi.fn(async () => []),
}));

vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("@sentry/react-native", () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "moment-1" }));
vi.mock("@/lib/providers", () => ({
  getProvider: () => ({ fetchPreviewUrl: mocks.fetchPreviewUrl, lookupSong: mocks.lookupSong }),
}));
vi.mock("@/lib/albums", () => ({ addMomentToAlbum: vi.fn(async () => {}) }));
// Linked photos (1.4): no Photos library in tests, so nothing links.
vi.mock("@/modules/now-playing", () => ({ cloudIdsFor: vi.fn(async () => ({})) }));
vi.mock("@/lib/storage", () => ({
  uploadMomentPhotos: mocks.uploadMomentPhotos,
  deleteMomentPhotos: mocks.deleteMomentPhotos,
}));
vi.mock("@/lib/voiceStorage", () => ({ uploadVoice: mocks.uploadVoice, deleteVoice: mocks.deleteVoice }));

import { saveMoment, updateMoment, type UpdateMomentInput } from "../saveMoment";
import { EMPTY_SONG_LOOKUP, type SongLookup } from "../songMetadata";
import * as Sentry from "@sentry/react-native";

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
  mocks.lookupSong = undefined;
  mocks.uploadVoice.mockReset();
  mocks.uploadVoice.mockImplementation(async (userId: string, momentId: string) => `${userId}/${momentId}-1.m4a`);
  mocks.deleteVoice.mockClear();
});

const DETAILS = {
  previewUrl: "https://audio/lookup.m4a",
  albumName: "Menagerie",
  genre: "R&B/Soul",
  releaseDate: "1977-11-01",
  artistId: "158038",
  albumId: "1440825016",
  durationMs: 254000,
};

const METADATA_COLUMNS = {
  song_genre: "R&B/Soul",
  song_release_date: "1977-11-01",
  song_artist_id: "158038",
  song_album_id: "1440825016",
  song_duration_ms: 254000,
};

const NULL_METADATA = {
  song_genre: null,
  song_release_date: null,
  song_artist_id: null,
  song_album_id: null,
  song_duration_ms: null,
};

const MISSING_COLUMN = { code: "PGRST204", message: "Could not find the 'song_genre' column of 'moments' in the schema cache" };

const writesOf = (method: "insert" | "update") =>
  sb.queries.flatMap((q) => q.chain).filter((c) => c.method === method).map((c) => c.args[0] as Record<string, unknown>);

const writeOf = (method: "insert" | "update") =>
  sb.queries.flatMap((q) => q.chain).find((c) => c.method === method)!.args[0] as Record<string, unknown>;

describe("saveMoment", () => {
  it("doesn't wait for a pending preview lookup before uploading photos", async () => {
    let resolvePreview!: (v: SongLookup) => void;
    const pending = new Promise<SongLookup>((r) => (resolvePreview = r));
    sb.queueData(row());

    const saving = saveMoment({ ...base, photos: ["file:///a.jpg"], prefetchedPreview: pending });
    await Promise.resolve();
    expect(mocks.uploadMomentPhotos).toHaveBeenCalledTimes(1);

    resolvePreview({ ...EMPTY_SONG_LOOKUP, previewUrl: "https://audio/p.m4a" });
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

describe("saveMoment with an id picked by the caller (the offline outbox)", () => {
  const DUPLICATE = { code: "23505", message: 'duplicate key value violates unique constraint "moments_pkey"' };

  it("inserts under the given id instead of a new one", async () => {
    sb.queueData(row({ id: "queued-1" }));
    const result = await saveMoment({ ...base, photos: [], momentId: "queued-1" });
    expect(writeOf("insert").id).toBe("queued-1");
    expect(result.id).toBe("queued-1");
  });

  it("a retry of a save that already landed succeeds with the stored row", async () => {
    sb.queueError(DUPLICATE);
    sb.queueData(row({ id: "queued-1", photo_urls: ["u1/first.jpg"], photo_thumbnails: ["u1/thumb_first.jpg"] }));

    const result = await saveMoment({ ...base, photos: ["file:///a.jpg"], momentId: "queued-1" });

    expect(result.id).toBe("queued-1");
    expect(result.moment.photoUrls).toEqual(["u1/first.jpg"]);
    // The read-back looked for this id.
    expect(sb.queries[1].chain.find((c) => c.method === "eq")?.args).toEqual(["id", "queued-1"]);
    // This attempt's uploads aren't on the stored row: they go.
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledWith([...NEW.photoPaths, ...NEW.thumbnailPaths]);
  });

  it("keeps this attempt's photos when the lost-response row is its own", async () => {
    sb.queueError("network");
    sb.queueData(row({ id: "queued-1", photo_urls: NEW.photoPaths, photo_thumbnails: NEW.thumbnailPaths }));

    await expect(saveMoment({ ...base, photos: ["file:///a.jpg"], momentId: "queued-1" })).resolves.toMatchObject({
      id: "queued-1",
    });
    expect(mocks.deleteMomentPhotos).not.toHaveBeenCalled();
  });

  it("still fails when a duplicate id can't be read back", async () => {
    sb.queueError(DUPLICATE);
    sb.queueError("offline");

    await expect(saveMoment({ ...base, photos: ["file:///a.jpg"], momentId: "queued-1" })).rejects.toMatchObject({
      code: "23505",
    });
    expect(mocks.deleteMomentPhotos).not.toHaveBeenCalled();
  });
});

const edit = (over: Partial<UpdateMomentInput> = {}): UpdateMomentInput => ({
  ...base,
  momentId: "moment-1",
  originalSong: song,
  originalPhotos: ["u1/old1.jpg", "u1/old2.jpg"],
  originalThumbnails: ["u1/thumb_old1.jpg", "u1/thumb_old2.jpg"],
  photos: [
    { kind: "kept", path: "u1/old1.jpg", thumb: "u1/thumb_old1.jpg" },
    { kind: "new", uri: "file:///a.jpg" },
  ],
  ...over,
});

describe("saveMoment song details", () => {
  it("saves the lookup's details and how the moment was captured", async () => {
    mocks.lookupSong = vi.fn(async () => DETAILS);
    sb.queueData(row());
    await saveMoment({ ...base, photos: [], captureSource: "now_playing" });

    expect(writeOf("insert")).toMatchObject({
      song_preview_url: "https://audio/lookup.m4a",
      ...METADATA_COLUMNS,
      capture_source: "now_playing",
    });
  });

  it("uses the details from a lookup capture already started", async () => {
    sb.queueData(row());
    await saveMoment({ ...base, photos: [], prefetchedPreview: Promise.resolve(DETAILS) });
    expect(writeOf("insert")).toMatchObject(METADATA_COLUMNS);
    expect(writeOf("insert").capture_source).toBeNull();
  });

  it("leaves the details null for a provider without a catalog lookup (Spotify)", async () => {
    sb.queueData(row());
    await saveMoment({ ...base, song: { ...song, provider: "spotify", appleMusicId: null, spotifyId: "s1" }, photos: [] });
    expect(writeOf("insert")).toMatchObject({ song_preview_url: "https://audio/preview.m4a", ...NULL_METADATA });
  });

  it("saves as before when the lookup fails", async () => {
    mocks.lookupSong = vi.fn(async () => {
      throw new Error("offline");
    });
    sb.queueData(row());
    await saveMoment({ ...base, photos: [] });
    expect(writeOf("insert")).toMatchObject({ song_preview_url: null, ...NULL_METADATA });
  });

  it("retries without the new columns when the database doesn't have them yet", async () => {
    mocks.lookupSong = vi.fn(async () => DETAILS);
    sb.queueError(MISSING_COLUMN);
    sb.queueData(row({ photo_urls: NEW.photoPaths }));

    const result = await saveMoment({ ...base, photos: ["file:///a.jpg"], captureSource: "search" });

    expect(result.id).toBe("moment-1");
    const [first, retry] = writesOf("insert");
    expect(first).toMatchObject({ ...METADATA_COLUMNS, capture_source: "search" });
    for (const col of [...Object.keys(METADATA_COLUMNS), "capture_source"]) expect(retry).not.toHaveProperty(col);
    expect(retry).toMatchObject({ id: "moment-1", song_title: song.title, song_preview_url: "https://audio/lookup.m4a" });
    // Saved by the retry: no read-back, nothing deleted.
    expect(sb.queries).toHaveLength(2);
    expect(mocks.deleteMomentPhotos).not.toHaveBeenCalled();
  });
});

describe("updateMoment", () => {
  it("leaves the stored preview alone when the song didn't change", async () => {
    sb.queueData(row());
    await updateMoment(edit());

    expect(mocks.fetchPreviewUrl).not.toHaveBeenCalled();
    expect(writeOf("update")).not.toHaveProperty("song_preview_url");
    expect(writeOf("update")).not.toHaveProperty("song_genre");
  });

  it("replaces the song details when the song changed, and never touches capture_source", async () => {
    mocks.lookupSong = vi.fn(async () => DETAILS);
    sb.queueData(row());
    await updateMoment(edit({ song: { ...song, appleMusicId: "2", title: "Other" } }));

    expect(writeOf("update")).toMatchObject({ song_preview_url: "https://audio/lookup.m4a", ...METADATA_COLUMNS });
    expect(writeOf("update")).not.toHaveProperty("capture_source");
  });

  it("clears the old song's details when the new song has none", async () => {
    sb.queueData(row());
    await updateMoment(edit({ song: { ...song, provider: "spotify", appleMusicId: null, spotifyId: "s1" } }));
    expect(writeOf("update")).toMatchObject(NULL_METADATA);
  });

  it("retries the update without the new columns when the database doesn't have them yet", async () => {
    mocks.lookupSong = vi.fn(async () => DETAILS);
    sb.queueError(MISSING_COLUMN);
    sb.queueData(row());
    await updateMoment(edit({ song: { ...song, appleMusicId: "2", title: "Other" } }));

    const [, retry] = writesOf("update");
    expect(retry).not.toHaveProperty("song_genre");
    expect(retry).toMatchObject({ song_title: "Other", song_preview_url: "https://audio/lookup.m4a" });
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledWith(["u1/old2.jpg"], ["u1/thumb_old2.jpg"]);
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

  it("saves a new photo dragged ahead of a stored one in that order", async () => {
    sb.queueData(row());
    await updateMoment(
      edit({
        photos: [
          { kind: "new", uri: "file:///a.jpg" },
          { kind: "kept", path: "u1/old2.jpg", thumb: "u1/thumb_old2.jpg" },
        ],
      })
    );

    // Not from the library, so it uploads in full (not linked).
    expect(mocks.uploadMomentPhotos).toHaveBeenCalledWith("u1", ["file:///a.jpg"], [false]);
    expect(writeOf("update")).toMatchObject({
      photo_urls: ["u1/new.jpg", "u1/old2.jpg"],
      photo_thumbnails: ["u1/thumb_new.jpg", "u1/thumb_old2.jpg"],
    });
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledWith(["u1/old1.jpg"], ["u1/thumb_old1.jpg"]);
  });

  it("when a photo upload fails, fails the save without writing or deleting anything", async () => {
    mocks.uploadMomentPhotos.mockRejectedValue(new Error("upload failed"));

    await expect(updateMoment(edit())).rejects.toMatchObject({ message: "upload failed" });
    expect(sb.queries).toHaveLength(0);
    expect(mocks.deleteMomentPhotos).not.toHaveBeenCalled();
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

describe("who was there links", () => {
  const linkQueries = () => sb.queries.filter((q) => q.table === "moment_people_links");
  const SAM = { name: "Sam", friendId: "f1" };

  beforeEach(() => vi.mocked(Sentry.captureException).mockClear());

  it("writes the links after the moment row", async () => {
    sb.queueData(row());
    await saveMoment({ ...base, people: ["Sam"], photos: [], peopleLinks: [SAM] });

    expect(sb.queries.map((q) => q.table)).toEqual(["moments", "moment_people_links"]);
    expect(linkQueries()[0].chain[0]).toMatchObject({
      method: "upsert",
      args: [
        [{ moment_id: "moment-1", owner_id: "u1", name: "Sam", friend_id: "f1" }],
        { onConflict: "moment_id,friend_id" },
      ],
    });
  });

  it("writes nothing for a moment without links", async () => {
    sb.queueData(row());
    await saveMoment({ ...base, people: ["Sam"], photos: [] });
    expect(linkQueries()).toHaveLength(0);
  });

  it("never fails the save when linking fails, and tells Sentry", async () => {
    sb.queueData(row());
    sb.queueError({ code: "42501", message: "new row violates row-level security policy" });

    const result = await saveMoment({ ...base, people: ["Sam"], photos: [], peopleLinks: [SAM] });
    expect(result.id).toBe("moment-1");
    expect(result.secondaryFailures).toEqual([]);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("is quietly skipped before the migration (no table)", async () => {
    sb.queueData(row());
    sb.queueError({
      code: "PGRST205",
      message: "Could not find the table 'public.moment_people_links' in the schema cache",
    });

    await expect(saveMoment({ ...base, people: ["Sam"], photos: [], peopleLinks: [SAM] })).resolves.toBeTruthy();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("an edit leaves stored links alone when the editor didn't load them", async () => {
    sb.queueData(row());
    await updateMoment(edit({ people: ["Sam"] }));
    expect(linkQueries()).toHaveLength(0);
  });

  it("an edit removes the link of a name taken off the moment", async () => {
    sb.queueData(row());
    await updateMoment(edit({ people: [], originalPeopleLinks: [SAM], peopleLinks: [SAM] }));

    expect(linkQueries()).toHaveLength(1);
    const chain = linkQueries()[0].chain;
    expect(chain[0].method).toBe("delete");
    expect(chain.find((c) => c.method === "in")?.args).toEqual(["friend_id", ["f1"]]);
  });
});

describe("the voice recording", () => {
  const VOICE_PATH = "u1/moment-1-1.m4a";
  const take = { voiceUri: "file:///Documents/capture-voice/u1/voice-1.m4a", voiceDurationMs: 42_000 };

  it("uploads it alongside the photos under the moment's id and saves its path and length", async () => {
    sb.queueData(row({ voice_path: VOICE_PATH, voice_duration_ms: 42_000 }));
    const result = await saveMoment({ ...base, photos: ["file:///a.jpg"], ...take });

    expect(mocks.uploadVoice).toHaveBeenCalledWith("u1", "moment-1", take.voiceUri);
    expect(writeOf("insert")).toMatchObject({ id: "moment-1", voice_path: VOICE_PATH, voice_duration_ms: 42_000 });
    expect(result.secondaryFailures).toEqual([]);
    expect(result.moment.voicePath).toBe(VOICE_PATH);
    expect(mocks.deleteVoice).not.toHaveBeenCalled();
  });

  it("writes no recording when there isn't one", async () => {
    sb.queueData(row());
    await saveMoment({ ...base, photos: [] });
    expect(mocks.uploadVoice).not.toHaveBeenCalled();
    expect(writeOf("insert")).toMatchObject({ voice_path: null, voice_duration_ms: null });
  });

  it("when a photo upload fails, deletes the uploaded recording and writes nothing", async () => {
    mocks.uploadMomentPhotos.mockRejectedValue(new Error("upload failed"));
    await expect(saveMoment({ ...base, photos: ["file:///a.jpg"], ...take })).rejects.toMatchObject({ message: "upload failed" });
    expect(mocks.deleteVoice).toHaveBeenCalledWith([VOICE_PATH]);
    expect(sb.queries).toHaveLength(0);
  });

  it("when the recording's upload fails, deletes the uploaded photos and writes nothing", async () => {
    mocks.uploadVoice.mockRejectedValue(new Error("voice failed"));
    await expect(saveMoment({ ...base, photos: ["file:///a.jpg"], ...take })).rejects.toMatchObject({ message: "voice failed" });
    expect(mocks.deleteMomentPhotos).toHaveBeenCalledWith(NEW.photoPaths, NEW.thumbnailPaths);
    expect(sb.queries).toHaveLength(0);
  });

  it("deletes the recording when the insert is confirmed not to have landed", async () => {
    sb.queueError("network");
    sb.queueData(null);
    await expect(saveMoment({ ...base, photos: [], ...take })).rejects.toMatchObject({ message: "network" });
    expect(mocks.deleteVoice).toHaveBeenCalledWith([VOICE_PATH]);
  });

  it("a retry of a save that already landed keeps the first recording and says nothing", async () => {
    sb.queueError({ code: "23505", message: 'duplicate key value violates unique constraint "moments_pkey"' });
    sb.queueData(row({ id: "queued-1", voice_path: "u1/queued-1-0.m4a", voice_duration_ms: 42_000 }));
    const result = await saveMoment({ ...base, photos: [], momentId: "queued-1", ...take });

    expect(result.moment.voicePath).toBe("u1/queued-1-0.m4a");
    // This attempt's upload is the unused one.
    expect(mocks.deleteVoice).toHaveBeenCalledWith(["u1/queued-1-1.m4a"]);
    expect(result.secondaryFailures).toEqual([]);
  });

  it("saved without the voice columns (migration not applied): deletes the upload and says so", async () => {
    sb.queueError({ code: "PGRST204", message: "Could not find the 'voice_path' column of 'moments' in the schema cache" });
    sb.queueData(row());
    const result = await saveMoment({ ...base, photos: [], ...take });

    const [, retry] = writesOf("insert");
    expect(retry).not.toHaveProperty("voice_path");
    expect(retry).not.toHaveProperty("voice_duration_ms");
    expect(result.id).toBe("moment-1");
    expect(mocks.deleteVoice).toHaveBeenCalledWith([VOICE_PATH]);
    expect(result.secondaryFailures).toEqual(["the voice recording couldn't be kept"]);
  });
});

describe("the voice recording in an edit", () => {
  const OLD = "u1/moment-1-0.m4a";
  const NEW_VOICE = "u1/moment-1-1.m4a";
  const voiceEdit = (over: Partial<UpdateMomentInput> = {}) =>
    edit({
      photos: [
        { kind: "kept", path: "u1/old1.jpg", thumb: "u1/thumb_old1.jpg" },
        { kind: "kept", path: "u1/old2.jpg", thumb: "u1/thumb_old2.jpg" },
      ],
      originalVoicePath: OLD,
      ...over,
    });

  beforeEach(() => mocks.uploadMomentPhotos.mockResolvedValue({ photoPaths: [], thumbnailPaths: [] }));

  it("a plain edit never touches the recording", async () => {
    sb.queueData(row({ voice_path: OLD }));
    await updateMoment(voiceEdit());
    expect(mocks.uploadVoice).not.toHaveBeenCalled();
    expect(writeOf("update")).not.toHaveProperty("voice_path");
    expect(writeOf("update")).not.toHaveProperty("voice_duration_ms");
    expect(mocks.deleteVoice).not.toHaveBeenCalled();
  });

  it("recording again uploads the new take first, and deletes the old one once the update lands", async () => {
    sb.queueData(row({ voice_path: NEW_VOICE, voice_duration_ms: 30_000 }));
    const moment = await updateMoment(voiceEdit({ voice: { uri: "file:///take.m4a", durationMs: 30_000 } }));

    expect(mocks.uploadVoice).toHaveBeenCalledWith("u1", "moment-1", "file:///take.m4a");
    expect(writeOf("update")).toMatchObject({ voice_path: NEW_VOICE, voice_duration_ms: 30_000 });
    expect(mocks.deleteVoice).toHaveBeenCalledTimes(1);
    expect(mocks.deleteVoice).toHaveBeenCalledWith([OLD]);
    expect(moment.voicePath).toBe(NEW_VOICE);
  });

  it("adds a recording to a moment that had none", async () => {
    sb.queueData(row({ voice_path: NEW_VOICE, voice_duration_ms: 30_000 }));
    await updateMoment(voiceEdit({ originalVoicePath: null, voice: { uri: "file:///take.m4a", durationMs: 30_000 } }));
    expect(writeOf("update")).toMatchObject({ voice_path: NEW_VOICE });
    expect(mocks.deleteVoice).not.toHaveBeenCalled();
  });

  it("deleting it clears both columns, then the stored file", async () => {
    sb.queueData(row({ voice_path: null }));
    await updateMoment(voiceEdit({ voice: null }));
    expect(mocks.uploadVoice).not.toHaveBeenCalled();
    expect(writeOf("update")).toMatchObject({ voice_path: null, voice_duration_ms: null });
    expect(mocks.deleteVoice).toHaveBeenCalledWith([OLD]);
  });

  it("on a failed update, deletes the new take and keeps the old one", async () => {
    sb.queueError("network");
    sb.queueData(row({ voice_path: OLD }));
    await expect(updateMoment(voiceEdit({ voice: { uri: "file:///take.m4a", durationMs: 30_000 } }))).rejects.toMatchObject({
      message: "network",
    });
    expect(mocks.deleteVoice).toHaveBeenCalledTimes(1);
    expect(mocks.deleteVoice).toHaveBeenCalledWith([NEW_VOICE]);
  });

  it("treats an update that landed despite the error as saved", async () => {
    sb.queueError("network");
    sb.queueData(row({ voice_path: NEW_VOICE }));
    await updateMoment(voiceEdit({ voice: { uri: "file:///take.m4a", durationMs: 30_000 } }));
    expect(mocks.deleteVoice).toHaveBeenCalledWith([OLD]);
    expect(mocks.deleteVoice).not.toHaveBeenCalledWith([NEW_VOICE]);
  });

  it("a removal that fails leaves the stored file alone", async () => {
    sb.queueError("network");
    await expect(updateMoment(voiceEdit({ voice: null }))).rejects.toMatchObject({ message: "network" });
    expect(mocks.deleteVoice).not.toHaveBeenCalled();
  });
});
