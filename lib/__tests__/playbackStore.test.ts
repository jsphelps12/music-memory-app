import { describe, expect, it, vi } from "vitest";
import { createPlaybackStore, isSongPlaying, playbackSongId } from "../playbackStore";
import type { Song } from "@/types";

const song = (over: Partial<Song>): Song => ({
  id: "x",
  title: "T",
  artistName: "A",
  albumName: "",
  artworkUrl: "",
  provider: "apple_music",
  appleMusicId: null,
  spotifyId: null,
  durationMs: 0,
  ...over,
});

describe("playbackSongId", () => {
  it("prefers the Spotify id, then Apple Music's", () => {
    expect(playbackSongId(song({ spotifyId: "sp1", appleMusicId: "am1" }))).toBe("sp1");
    expect(playbackSongId(song({ appleMusicId: "am1" }))).toBe("am1");
    expect(playbackSongId(song({}))).toBeNull();
    expect(playbackSongId(null)).toBeNull();
  });
});

describe("isSongPlaying", () => {
  const current = song({ appleMusicId: "am1" });
  it("only for the current song, and only while playing", () => {
    expect(isSongPlaying({ currentSong: current, isPlaying: true }, "am1")).toBe(true);
    expect(isSongPlaying({ currentSong: current, isPlaying: false }, "am1")).toBe(false);
    expect(isSongPlaying({ currentSong: current, isPlaying: true }, "am2")).toBe(false);
    expect(isSongPlaying({ currentSong: null, isPlaying: true }, "am1")).toBe(false);
  });
  it("a moment without a song id never matches", () => {
    expect(isSongPlaying({ currentSong: song({}), isPlaying: true }, null)).toBe(false);
    expect(isSongPlaying({ currentSong: song({}), isPlaying: true }, "")).toBe(false);
  });
});

describe("createPlaybackStore", () => {
  it("notifies on a change and not on a repeat", () => {
    const store = createPlaybackStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const s = song({ appleMusicId: "am1" });
    store.set({ currentSong: s, isPlaying: true });
    store.set({ currentSong: s, isPlaying: true });
    expect(listener).toHaveBeenCalledTimes(1);
    store.set({ currentSong: s, isPlaying: false });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get()).toEqual({ currentSong: s, isPlaying: false });
  });

  it("stops notifying after unsubscribe", () => {
    const store = createPlaybackStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set({ currentSong: null, isPlaying: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it("a row's answer only changes when its own song starts or stops", () => {
    const store = createPlaybackStore();
    const a = song({ appleMusicId: "a" });
    const b = song({ appleMusicId: "b" });
    const answersForC: boolean[] = [];
    store.subscribe(() => answersForC.push(isSongPlaying(store.get(), "c")));
    store.set({ currentSong: a, isPlaying: true });
    store.set({ currentSong: b, isPlaying: true });
    // Row "c" is asked each time, but its answer never flips, so
    // useSyncExternalStore doesn't re-render it.
    expect(new Set(answersForC)).toEqual(new Set([false]));
  });
});
