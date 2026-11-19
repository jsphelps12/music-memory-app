import { describe, expect, it, vi } from "vitest";
import { createMixRestore, DUCK_LEVEL, DUCK_MS, fadeVolume, RESTORE_MS } from "../audioMix";

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
