import { describe, expect, it } from "vitest";
import { loadsVideo, PHOTO_MS, videoHoldMs, videoLoad } from "../filmPlayback";

const on = { active: true, playing: true, loop: false, usable: true, ready: true };

describe("videoHoldMs", () => {
  it("a ready video moves on by its own end, not a timer", () => {
    expect(videoHoldMs(on)).toBeNull();
  });

  it("a video still loading when it comes up holds its poster like a photo, then moves on", () => {
    expect(videoHoldMs({ ...on, ready: false })).toBe(PHOTO_MS);
  });

  it("a video that can't play here (or failed) holds its poster like a photo", () => {
    expect(videoHoldMs({ ...on, usable: false, ready: false })).toBe(PHOTO_MS);
    expect(videoHoldMs({ ...on, usable: false })).toBe(PHOTO_MS);
  });

  it("never moves on when paused, off screen, or the only item (looping)", () => {
    expect(videoHoldMs({ ...on, ready: false, playing: false })).toBeNull();
    expect(videoHoldMs({ ...on, ready: false, active: false })).toBeNull();
    expect(videoHoldMs({ ...on, ready: false, loop: true })).toBeNull();
  });
});

describe("loadsVideo", () => {
  const loaded = (index: number, under: number | null, count: number) =>
    Array.from({ length: count }, (_, i) => i).filter((i) => loadsVideo(i, index, under, count));

  it("loads the item on screen and the next one, not the one behind", () => {
    expect(loaded(2, null, 5)).toEqual([2, 3]);
  });

  it("keeps the item fading out loaded, so it holds its last frame", () => {
    expect(loaded(3, 2, 5)).toEqual([2, 3, 4]);
  });

  it("wraps: the last item's next is the first", () => {
    expect(loaded(4, null, 5)).toEqual([0, 4]);
  });

  it("a single item loads only itself; two items both load", () => {
    expect(loaded(0, null, 1)).toEqual([0]);
    expect(loaded(0, null, 2)).toEqual([0, 1]);
  });
});

describe("videoLoad", () => {
  const modes = (index: number, under: number | null, count: number) =>
    Array.from({ length: count }, (_, i) => videoLoad(i, index, under, count));

  it("only the item on screen loads at full quality", () => {
    expect(modes(2, null, 5)).toEqual([null, null, "full", "light", null]);
  });

  it("the next item and the one fading out load light", () => {
    expect(modes(3, 2, 5)).toEqual([null, null, "light", "full", "light"]);
  });

  it("never more than one full load, whatever the position", () => {
    for (let count = 1; count <= 6; count++) {
      for (let index = 0; index < count; index++) {
        for (const under of [null, ...Array.from({ length: count }, (_, i) => i)]) {
          if (under === index) continue;
          const all = modes(index, under, count);
          expect(all.filter((m) => m === "full")).toHaveLength(1);
          expect(all.filter((m) => m !== null).length).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("a single item is full; going back makes the item left behind light", () => {
    expect(modes(0, null, 1)).toEqual(["full"]);
    expect(modes(1, 2, 4)).toEqual([null, "full", "light", null]);
  });
});
