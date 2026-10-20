import { describe, it, expect } from "vitest";
import { moodLabel, moodWords } from "../moodLabels";

const ALL = [
  { value: "joyful", label: "Joyful" },
  { value: "custom_1729012345678", label: "Homesick" },
];

describe("moodLabel", () => {
  it("uses the definition's label", () => {
    expect(moodLabel("joyful", ALL)).toBe("Joyful");
    expect(moodLabel("custom_1729012345678", ALL)).toBe("Homesick");
  });

  it("hides a custom id whose definition was deleted", () => {
    expect(moodLabel("custom_1700000000000", ALL)).toBeNull();
    expect(moodLabel("CUSTOM_1700000000000", ALL)).toBeNull();
  });

  it("keeps an unknown plain word", () => {
    expect(moodLabel("dreamy", ALL)).toBe("dreamy");
  });

  it("drops empty values", () => {
    expect(moodLabel("", ALL)).toBeNull();
  });
});

describe("moodWords", () => {
  it("joins up to three labels in stored order, uppercased", () => {
    expect(moodWords(["joyful", "custom_1729012345678", "dreamy", "x"], ALL)).toBe(
      "JOYFUL · HOMESICK · DREAMY"
    );
  });

  it("skips deleted custom moods instead of printing their ids", () => {
    expect(moodWords(["custom_1700000000000", "joyful"], ALL)).toBe("JOYFUL");
    expect(moodWords(["custom_1700000000000"], ALL)).toBe("");
  });
});
