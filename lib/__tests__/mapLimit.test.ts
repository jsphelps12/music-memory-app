import { describe, expect, it } from "vitest";
import { mapLimit } from "../mapLimit";

describe("mapLimit", () => {
  it("keeps input order and never runs more than the limit at once", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([30, 5, 20, 1, 10], 2, async (ms, i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return i * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
  });
});
