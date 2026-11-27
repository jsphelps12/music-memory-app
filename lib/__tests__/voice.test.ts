/**
 * Voice entries (lib/voice.ts): where a recording is stored, what an edit
 * does to it, which takes on the phone the cleanup may delete, and the
 * storage calls (lib/voiceStorage.ts) against the supabase client stub: a
 * private bucket read only through signed URLs, which are reused until
 * they're close to running out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));
vi.mock("expo-file-system", () => ({
  File: class {
    constructor(public uri: string) {}
    async arrayBuffer() {
      return new ArrayBuffer(8);
    }
  },
}));

import {
  MAX_VOICE_MS,
  VOICE_LOAD_TIMEOUT_MS,
  VOICE_PLAYBACK_IDLE,
  nextVoicePlayback,
  voiceNeedsLoad,
  VOICE_FILE_GRACE_MS,
  isKeepableTake,
  isOwnVoicePath,
  keptVoiceNames,
  storableVoiceMs,
  takeLengthMs,
  usableCachedUrl,
  voiceEditFor,
  voiceFileName,
  voiceFileTime,
  voiceFilesToPrune,
  voiceFolder,
  voicePathFor,
  voiceTimeLabel,
} from "../voice";
import { clearVoiceUrlCache, deleteVoice, signedVoiceUrl, uploadVoice } from "../voiceStorage";

const NOW = 1_700_000_000_000;

describe("voicePathFor", () => {
  it("puts the recording in its owner's folder, named for its moment and the time", () => {
    expect(voicePathFor("u1", "m1", NOW)).toBe(`u1/m1-${NOW}.m4a`);
    expect(isOwnVoicePath(voicePathFor("u1", "m1", NOW), "u1")).toBe(true);
  });

  it("a new take never reuses the old path", () => {
    expect(voicePathFor("u1", "m1", NOW)).not.toBe(voicePathFor("u1", "m1", NOW + 1));
  });
});

describe("isOwnVoicePath", () => {
  it("is true only inside this person's folder", () => {
    expect(isOwnVoicePath("u1/m1-1.m4a", "u1")).toBe(true);
    expect(isOwnVoicePath("u2/m1-1.m4a", "u1")).toBe(false);
    expect(isOwnVoicePath("u10/m1-1.m4a", "u1")).toBe(false);
    expect(isOwnVoicePath("u1/", "u1")).toBe(false);
    expect(isOwnVoicePath(null, "u1")).toBe(false);
    expect(isOwnVoicePath("u1/m1-1.m4a", null)).toBe(false);
  });
});

describe("lengths", () => {
  it("stores whole ms, never negative, within the column's limit", () => {
    expect(storableVoiceMs(42_000.6)).toBe(42_001);
    expect(storableVoiceMs(-5)).toBe(0);
    expect(storableVoiceMs(NaN)).toBe(0);
    expect(storableVoiceMs(10_000_000)).toBe(185_000);
  });

  it("a take is kept at no more than 3 minutes, even a tick past the cap", () => {
    expect(takeLengthMs(MAX_VOICE_MS + 180)).toBe(MAX_VOICE_MS);
    expect(takeLengthMs(42_000)).toBe(42_000);
  });

  it("a take under a second is a slip, not something said", () => {
    expect(isKeepableTake(400)).toBe(false);
    expect(isKeepableTake(1000)).toBe(true);
    expect(isKeepableTake(NaN)).toBe(false);
  });

  it("reads like a time in a song", () => {
    expect(voiceTimeLabel(42_000)).toBe("0:42");
    expect(voiceTimeLabel(MAX_VOICE_MS)).toBe("3:00");
  });
});

describe("voiceEditFor", () => {
  const stored = { kind: "stored" as const, path: "u1/m1-1.m4a", durationMs: 42_000 };
  const local = { kind: "local" as const, uri: "file:///take.m4a", durationMs: 30_000 };

  it("leaves the stored recording alone when it's still there", () => {
    expect(voiceEditFor(stored.path, stored)).toBeUndefined();
  });

  it("a new take replaces or adds one", () => {
    expect(voiceEditFor(stored.path, local)).toEqual({ uri: local.uri, durationMs: 30_000 });
    expect(voiceEditFor(null, local)).toEqual({ uri: local.uri, durationMs: 30_000 });
  });

  it("deleting removes the stored one, and nothing to remove writes nothing", () => {
    expect(voiceEditFor(stored.path, null)).toBeNull();
    expect(voiceEditFor(null, null)).toBeUndefined();
  });
});

describe("takes on the phone", () => {
  it("names a take for when it was kept, and reads that back", () => {
    expect(voiceFileName(NOW)).toBe(`voice-${NOW}.m4a`);
    expect(voiceFileTime(voiceFileName(NOW))).toBe(NOW);
    expect(voiceFileTime("IMG_0001.jpg")).toBeNull();
  });

  it("knows which takes drafts point at", () => {
    const folder = voiceFolder("u1");
    expect(folder).toBe("doc:capture-voice/u1/");
    const names = keptVoiceNames(
      [
        { voice: { uri: `${folder}voice-1.m4a` } },
        { voice: null },
        {},
        // Someone else's folder, or a file outside the folder: not ours to keep.
        { voice: { uri: "doc:capture-voice/u2/voice-2.m4a" } },
        { voice: { uri: "file:///tmp/voice-3.m4a" } },
      ],
      "u1"
    );
    expect(names).toEqual(new Set(["voice-1.m4a"]));
  });

  it("prunes takes nothing points at once they're past the grace period, and anything else in the folder", () => {
    const fresh = voiceFileName(NOW - 60_000);
    const old = voiceFileName(NOW - VOICE_FILE_GRACE_MS - 1);
    const keptOld = voiceFileName(NOW - VOICE_FILE_GRACE_MS * 3);
    expect(voiceFilesToPrune([fresh, old, keptOld, "stray.tmp"], new Set([keptOld]), NOW)).toEqual([old, "stray.tmp"]);
  });
});

describe("usableCachedUrl", () => {
  it("reuses a URL with time left, never one about to run out", () => {
    expect(usableCachedUrl({ url: "u", expiresAt: NOW + 30 * 60_000 }, NOW)).toBe("u");
    expect(usableCachedUrl({ url: "u", expiresAt: NOW + 60_000 }, NOW)).toBeNull();
    expect(usableCachedUrl(undefined, NOW)).toBeNull();
  });
});

describe("storage", () => {
  beforeEach(() => {
    sb.reset();
    clearVoiceUrlCache();
  });
  afterEach(() => vi.useRealTimers());

  it("uploads to the private bucket as audio/mp4, in the owner's folder", async () => {
    const path = await uploadVoice("u1", "m1", "file:///take.m4a");
    expect(sb.storage.buckets).toEqual(["moment-voice"]);
    expect(path).toMatch(/^u1\/m1-\d+\.m4a$/);
    expect(sb.storage.upload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), {
      contentType: "audio/mp4",
      upsert: false,
    });
  });

  it("throws when the upload fails", async () => {
    sb.storage.upload.mockResolvedValueOnce({ data: null, error: { message: "Payload too large" } } as never);
    await expect(uploadVoice("u1", "m1", "file:///take.m4a")).rejects.toMatchObject({ message: "Payload too large" });
  });

  it("asks for an hour-long signed URL once, and reuses it", async () => {
    const first = await signedVoiceUrl("u1/m1-1.m4a");
    const again = await signedVoiceUrl("u1/m1-1.m4a");
    expect(again).toBe(first);
    expect(sb.storage.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(sb.storage.createSignedUrl).toHaveBeenCalledWith("u1/m1-1.m4a", 3600);
    // Never a public URL: the bucket is private.
    expect(sb.storage.getPublicUrl).not.toHaveBeenCalled();
  });

  it("asks again once the cached URL is close to running out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    await signedVoiceUrl("u1/m1-1.m4a");
    vi.setSystemTime(NOW + 56 * 60_000);
    await signedVoiceUrl("u1/m1-1.m4a");
    expect(sb.storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("throws when there's no URL to be had", async () => {
    sb.storage.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "Object not found" } } as never);
    await expect(signedVoiceUrl("u1/gone.m4a")).rejects.toMatchObject({ message: "Object not found" });
  });

  it("deletes each path once, skips empties, and never rejects", async () => {
    expect(await deleteVoice(["u1/a.m4a", null, "u1/a.m4a", undefined, "u1/b.m4a"])).toEqual(["u1/a.m4a", "u1/b.m4a"]);
    expect(sb.storage.remove).toHaveBeenCalledWith(["u1/a.m4a", "u1/b.m4a"]);
    expect(await deleteVoice([null])).toEqual([]);
    expect(sb.storage.remove).toHaveBeenCalledTimes(1);
    sb.storage.remove.mockRejectedValueOnce(new Error("offline"));
    await expect(deleteVoice(["u1/c.m4a"])).resolves.toEqual(["u1/c.m4a"]);
  });

  it("a deleted recording's signed URL isn't reused", async () => {
    await signedVoiceUrl("u1/m1-1.m4a");
    await deleteVoice(["u1/m1-1.m4a"]);
    await signedVoiceUrl("u1/m1-1.m4a");
    expect(sb.storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });
});

describe("voiceNeedsLoad", () => {
  const loaded = { key: "u/m-1.m4a", at: NOW };

  it("loads when the player has nothing, or another recording", () => {
    expect(voiceNeedsLoad(null, "u/m-1.m4a", "stored", NOW)).toBe(true);
    expect(voiceNeedsLoad(loaded, "u/m-2.m4a", "stored", NOW)).toBe(true);
  });

  it("replays what's loaded while its link is surely still good", () => {
    expect(voiceNeedsLoad(loaded, "u/m-1.m4a", "stored", NOW + 60_000)).toBe(false);
  });

  it("loads a stored one again once its signed URL may have lapsed", () => {
    expect(voiceNeedsLoad(loaded, "u/m-1.m4a", "stored", NOW + 5 * 60_000)).toBe(true);
    // A URL is never handed out with less than that left (usableCachedUrl).
    const entry = { url: "x", expiresAt: NOW + 5 * 60_000 + 1 };
    expect(usableCachedUrl(entry, NOW)).toBe("x");
  });

  it("a take on the phone never lapses", () => {
    expect(voiceNeedsLoad({ key: "file:///t.m4a", at: NOW }, "file:///t.m4a", "local", NOW + 86_400_000)).toBe(false);
  });

  it("gives a play a while to be heard, but not so long it looks stuck", () => {
    expect(VOICE_LOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    expect(VOICE_LOAD_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
});

describe("nextVoicePlayback", () => {
  const playing = { playing: true, currentTime: 1.5, duration: 42 };

  it("reads playing, position and length from a status", () => {
    expect(nextVoicePlayback(VOICE_PLAYBACK_IDLE, playing, true)).toEqual({
      playing: true,
      positionMs: 1500,
      durationMs: 42_000,
    });
  });

  it("keeps the same object when nothing shown changed (no re-render)", () => {
    const prev = nextVoicePlayback(VOICE_PLAYBACK_IDLE, playing, true);
    expect(nextVoicePlayback(prev, playing, true)).toBe(prev);
  });

  it("without positions (the film) only playing or not counts", () => {
    const prev = nextVoicePlayback(VOICE_PLAYBACK_IDLE, playing, false);
    expect(prev).toEqual({ playing: true, positionMs: 0, durationMs: 0 });
    expect(nextVoicePlayback(prev, { ...playing, currentTime: 9 }, false)).toBe(prev);
    expect(nextVoicePlayback(prev, { ...playing, playing: false }, false).playing).toBe(false);
  });

  it("never shows a length or position it can't read", () => {
    expect(nextVoicePlayback(VOICE_PLAYBACK_IDLE, { playing: false, currentTime: NaN, duration: NaN }, true)).toBe(
      VOICE_PLAYBACK_IDLE
    );
  });
});
