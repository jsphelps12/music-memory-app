import { describe, it, expect } from "vitest";
import { topValue } from "../utils";

describe("topValue", () => {
  it("returns null for an empty array", () => {
    expect(topValue([])).toBeNull();
  });

  it("returns null when all items are null or undefined", () => {
    expect(topValue([null, undefined, null])).toBeNull();
  });

  it("returns the only non-null item", () => {
    expect(topValue([null, "happy", undefined])).toBe("happy");
  });

  it("returns the most frequent value", () => {
    expect(topValue(["happy", "sad", "happy", "peaceful", "happy"])).toBe(
      "happy"
    );
  });

  it("returns the first winner when counts are tied (map insertion order)", () => {
    // "a" and "b" both appear twice; "a" is inserted first so it wins
    expect(topValue(["a", "b", "a", "b"])).toBe("a");
  });

  it("handles a single item", () => {
    expect(topValue(["nostalgic"])).toBe("nostalgic");
  });

  it("skips null and undefined but counts non-null values correctly", () => {
    expect(topValue([null, "calm", null, "calm", undefined, "anxious"])).toBe(
      "calm"
    );
  });

  it("handles all identical values", () => {
    expect(topValue(["joy", "joy", "joy"])).toBe("joy");
  });
});
