import { describe, expect, it, vi } from "vitest";
import { createMixRestore, DUCK_LEVEL, DUCK_MS, fadeVolume, quietVoice, RESTORE_MS } from "../audioMix";

describe("fadeVolume", () => {
  it("starts where it was and ends at the target", () => {
    expect(fadeVolume(1, DUCK_LEVEL, 0, DUCK_MS)).toBe(1);
    expect(fadeVolume(1, DUCK_LEVEL, DUCK_MS, DUCK_MS)).toBe(DUCK_LEVEL);
    expect(fadeVolume(DUCK_LEVEL, 1, RESTORE_MS + 50, RESTORE_MS)).toBe(1);
  });

  it("eases out: most of the change happens early", () => {
    const half = fadeVolume(1, 0, DUCK_MS / 2, DUCK_MS);
    expect(half).toBeLessThan(0.5);
    expect(half).toBeGreaterThan(0);
  });

  it("jumps when there's no time to fade", () => {
    expect(fadeVolume(1, 0.2, 10, 0)).toBe(0.2);
  });
});

describe("createMixRestore", () => {
  it("restores what was ducked exactly once, however many ways out call it", () => {
    const mix = createMixRestore();
    const undo = vi.fn();
    mix.hold(undo);
    expect(mix.held).toBe(true);
    // e.g. the sound turned off, then the film closed, then it unmounted.
    expect(mix.restore()).toBe(true);
    expect(mix.restore()).toBe(false);
    expect(mix.restore()).toBe(false);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(mix.held).toBe(false);
  });

  it("does nothing when nothing was ducked (clip sound on with no song playing)", () => {
    const mix = createMixRestore();
    expect(mix.restore()).toBe(false);
    expect(mix.held).toBe(false);
  });

  it("undoes every duck, newest first, even if one throws", () => {
    const mix = createMixRestore();
    const order: string[] = [];
    mix.hold(() => order.push("preview"));
    mix.hold(() => {
      order.push("others");
      throw new Error("session");
    });
    expect(mix.restore()).toBe(true);
    expect(order).toEqual(["others", "preview"]);
    expect(mix.held).toBe(false);
  });

  it("a duck after a restore is restored again", () => {
    const mix = createMixRestore();
    const undo = vi.fn();
    mix.hold(undo);
    mix.restore();
    mix.hold(undo);
    mix.restore();
    expect(undo).toHaveBeenCalledTimes(2);
  });
});

describe("quietVoice", () => {
  it("stops the voice before the song comes back up", () => {
    const mix = createMixRestore();
    const order: string[] = [];
    mix.hold(() => order.push("unduck"));
    expect(quietVoice(mix, () => order.push("stop voice"))).toBe(true);
    expect(order).toEqual(["stop voice", "unduck"]);
  });

  it("gives the song back exactly once, whichever ways out run and in whatever order", () => {
    // Every exit the film has: the voice ended, the film paused, closed, the
    // app went to the background, the voice turned off, a clip's sound took
    // over, the voice was dropped (offline, stalled), unmount.
    const exits = ["ended", "paused", "closed", "background", "voice off", "clip sound", "dropped", "unmount"];
    for (const first of exits) {
      const mix = createMixRestore();
      const unduck = vi.fn();
      const stop = vi.fn();
      mix.hold(unduck);
      // The first way out, then every other one after it (a close also
      // unmounts, a pause then a close, and so on).
      for (const _exit of [first, ...exits.filter((e) => e !== first)]) quietVoice(mix, stop);
      expect(unduck, first).toHaveBeenCalledTimes(1);
      expect(stop, first).toHaveBeenCalledTimes(exits.length);
      expect(mix.held).toBe(false);
    }
  });

  it("a voice that never ducked anything (no song playing) restores nothing", () => {
    const mix = createMixRestore();
    const stop = vi.fn();
    expect(quietVoice(mix, stop)).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("the song still comes back if stopping the voice throws (player already released)", () => {
    const mix = createMixRestore();
    const unduck = vi.fn();
    mix.hold(unduck);
    expect(
      quietVoice(mix, () => {
        throw new Error("released");
      })
    ).toBe(true);
    expect(unduck).toHaveBeenCalledTimes(1);
  });

  it("paused and played again: each duck is given back once", () => {
    const mix = createMixRestore();
    const unduck = vi.fn();
    mix.hold(unduck); // the voice comes in
    quietVoice(mix, () => {}); // Pause
    mix.hold(unduck); // Play: it carries on, ducked again
    quietVoice(mix, () => {}); // it ends
    quietVoice(mix, () => {}); // then the film closes
    expect(unduck).toHaveBeenCalledTimes(2);
  });
});
