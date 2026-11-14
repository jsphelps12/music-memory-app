import { describe, expect, it } from "vitest";
import { playAction } from "../playerAction";

describe("playAction", () => {
  it("pauses this moment's song while it plays", () => {
    expect(playAction("123", "123", true)).toBe("pause");
  });

  it("resumes this moment's song when it's loaded but paused (back from the background)", () => {
    expect(playAction("123", "123", false)).toBe("resume");
  });

  it("plays from the start when another song (or nothing) is loaded", () => {
    expect(playAction("123", "456", true)).toBe("play");
    expect(playAction("123", "456", false)).toBe("play");
    expect(playAction("123", null, false)).toBe("play");
  });

  it("never matches when the moment has no song id", () => {
    expect(playAction(null, null, false)).toBe("play");
    expect(playAction(undefined, undefined, true)).toBe("play");
  });
});
