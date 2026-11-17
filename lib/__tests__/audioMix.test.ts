import { describe, expect, it } from "vitest";
import { DUCK_LEVEL, DUCK_MS, fadeVolume, RESTORE_MS } from "../audioMix";

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
