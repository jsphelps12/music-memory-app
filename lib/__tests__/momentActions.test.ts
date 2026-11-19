import { describe, expect, it, vi } from "vitest";
import { shouldStopForDeletedMoment, stopSongOfDeletedMoment } from "../momentActions";
import type { Song } from "@/types";

function song(ids: { spotifyId?: string | null; appleMusicId?: string | null }): Song {
  return {
    id: ids.spotifyId ?? ids.appleMusicId ?? "",
    title: "T",
    artistName: "A",
    albumName: "",
    artworkUrl: "",
    provider: ids.spotifyId ? "spotify" : "apple_music",
    appleMusicId: ids.appleMusicId ?? null,
    spotifyId: ids.spotifyId ?? null,
    durationMs: 0,
  };
}

describe("shouldStopForDeletedMoment", () => {
  it("stops when the deleted moment's song is loaded", () => {
    expect(shouldStopForDeletedMoment({ songAppleMusicId: "123" }, song({ appleMusicId: "123" }))).toBe(true);
    expect(shouldStopForDeletedMoment({ songSpotifyId: "sp", songAppleMusicId: "123" }, song({ spotifyId: "sp" }))).toBe(true);
  });

  it("leaves another song alone", () => {
    expect(shouldStopForDeletedMoment({ songAppleMusicId: "123" }, song({ appleMusicId: "456" }))).toBe(false);
  });

  it("with nothing loaded, stops only when asked to cancel a pending start", () => {
    expect(shouldStopForDeletedMoment({ songAppleMusicId: "123" }, null)).toBe(false);
    expect(shouldStopForDeletedMoment({ songAppleMusicId: "123" }, null, { orIdle: true })).toBe(true);
  });

  it("never stops for a moment without a song id", () => {
    expect(shouldStopForDeletedMoment({}, null, { orIdle: true })).toBe(false);
    expect(shouldStopForDeletedMoment({ songAppleMusicId: null }, song({ appleMusicId: "1" }))).toBe(false);
  });
});

describe("stopSongOfDeletedMoment", () => {
  it("reads the live song and stops it", () => {
    const stop = vi.fn();
    stopSongOfDeletedMoment({ getCurrentSong: () => song({ appleMusicId: "123" }), stop }, { songAppleMusicId: "123" });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("doesn't stop someone else's song", () => {
    const stop = vi.fn();
    stopSongOfDeletedMoment({ getCurrentSong: () => song({ appleMusicId: "9" }), stop }, { songAppleMusicId: "123" });
    expect(stop).not.toHaveBeenCalled();
  });
});
