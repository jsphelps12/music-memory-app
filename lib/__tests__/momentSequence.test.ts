/**
 * Flipping through the list a moment was opened from: the consume-once hand-
 * off, the bounds, and the gesture thresholds the moment screen's pans use.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  CLOSE_DISTANCE,
  FLIP_MIN_DISTANCE,
  SEQUENCE_TTL_MS,
  consumeMomentSequence,
  flipDirection,
  momentAt,
  rubberBand,
  sequenceFromList,
  setMomentSequence,
  shouldClose,
  stepIndex,
} from "../momentSequence";
import type { MomentCardData } from "@/types";

const card = (id: string): MomentCardData =>
  ({ id, userId: "u", songTitle: `Song ${id}`, songArtist: "A" }) as MomentCardData;
const list = [card("a"), card("b"), card("c")];

beforeEach(() => {
  setMomentSequence(null);
});

describe("sequenceFromList", () => {
  it("indexes the opened moment and keeps the cards in order", () => {
    const seq = sequenceFromList(list, "b");
    expect(seq?.ids).toEqual(["a", "b", "c"]);
    expect(seq?.index).toBe(1);
    expect(momentAt(seq!, 2)?.id).toBe("c");
  });

  it("is null for a moment not in the list, or a list of one", () => {
    expect(sequenceFromList(list, "z")).toBeNull();
    expect(sequenceFromList([card("a")], "a")).toBeNull();
  });

  it("copies the list, so the list changing afterwards doesn't move the pages", () => {
    const mutable = [...list];
    const seq = sequenceFromList(mutable, "a")!;
    mutable.pop();
    expect(seq.moments).toHaveLength(3);
  });
});

describe("consumeMomentSequence", () => {
  it("hands over once", () => {
    setMomentSequence(sequenceFromList(list, "b"), 1000);
    expect(consumeMomentSequence("b", 1100)?.index).toBe(1);
    expect(consumeMomentSequence("b", 1100)).toBeNull();
  });

  it("ignores one set for a different moment, and clears it", () => {
    setMomentSequence(sequenceFromList(list, "b"), 1000);
    expect(consumeMomentSequence("c", 1100)).toBeNull();
    expect(consumeMomentSequence("b", 1100)).toBeNull();
  });

  it("ignores a leftover from a tap whose navigation never happened", () => {
    setMomentSequence(sequenceFromList(list, "b"), 1000);
    expect(consumeMomentSequence("b", 1000 + SEQUENCE_TTL_MS + 1)).toBeNull();
  });

  it("is null when nothing was set", () => {
    expect(consumeMomentSequence("a")).toBeNull();
  });

  it("works without card data (ids only)", () => {
    setMomentSequence({ ids: ["a", "b"], index: 0 }, 0);
    const seq = consumeMomentSequence("a", 1)!;
    expect(momentAt(seq, 1)).toBeNull();
  });
});

describe("stepIndex", () => {
  const seq = sequenceFromList(list, "a")!;
  it("steps within the list", () => {
    expect(stepIndex(seq, 0, 1)).toBe(1);
    expect(stepIndex(seq, 2, -1)).toBe(1);
  });
  it("stops at both ends, no wrap", () => {
    expect(stepIndex(seq, 0, -1)).toBeNull();
    expect(stepIndex(seq, 2, 1)).toBeNull();
  });
});

describe("flipDirection", () => {
  const W = 400;
  it("a far drag left flips to the next, right to the previous", () => {
    expect(flipDirection(-150, 0, W, true, true)).toBe(1);
    expect(flipDirection(150, 0, W, true, true)).toBe(-1);
  });

  it("a short slow drag settles back", () => {
    expect(flipDirection(-60, -100, W, true, true)).toBe(0);
  });

  it("a short fast flick flips", () => {
    expect(flipDirection(-FLIP_MIN_DISTANCE, -800, W, true, true)).toBe(1);
    expect(flipDirection(FLIP_MIN_DISTANCE - 1, 2000, W, true, true)).toBe(0);
  });

  it("a far drag thrown back cancels", () => {
    expect(flipDirection(-150, 600, W, true, true)).toBe(0);
  });

  it("never flips toward an end", () => {
    expect(flipDirection(-300, -2000, W, true, false)).toBe(0);
    expect(flipDirection(300, 2000, W, false, true)).toBe(0);
  });

  it("no movement, no flip", () => {
    expect(flipDirection(0, 900, W, true, true)).toBe(0);
  });
});

describe("shouldClose", () => {
  it("closes past the distance, or on a fast flick down", () => {
    expect(shouldClose(CLOSE_DISTANCE + 1, 0)).toBe(true);
    expect(shouldClose(40, 1200)).toBe(true);
  });
  it("springs back from a short slow pull, or a far one thrown back up", () => {
    expect(shouldClose(80, 200)).toBe(false);
    expect(shouldClose(CLOSE_DISTANCE + 50, -800)).toBe(false);
    expect(shouldClose(10, 3000)).toBe(false);
  });
});

describe("rubberBand", () => {
  it("follows less than the finger, keeping the sign", () => {
    const r = rubberBand(100, 390);
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(55);
    expect(rubberBand(-100, 390)).toBeCloseTo(-r);
  });
  it("never passes the dimension", () => {
    expect(rubberBand(1e6, 390)).toBeLessThan(390);
  });
  it("is zero at rest", () => {
    expect(rubberBand(0, 390)).toBe(0);
  });
});
