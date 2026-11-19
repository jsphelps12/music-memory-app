import { describe, expect, it } from "vitest";
import { factsText, templateQuestion, validQuestion, type QuestionFacts } from "../nudgeQuestion";

const kona: QuestionFacts = {
  song: "Ojitos Lindos",
  artist: "Bad Bunny",
  at: new Date(2024, 7, 8).getTime(),
  place: "Kailua-Kona",
  away: true,
  event: "beach",
  photoCount: 70,
};

describe("factsText", () => {
  it("states only the facts", () => {
    expect(factsText(kona)).toBe(
      [
        "Song: Ojitos Lindos by Bad Bunny",
        "They added it to their library in August 2024",
        "They were away from home, in Kailua-Kona",
        "Their photos that week were at the beach",
        "They took 70 photos that week",
      ].join("\n")
    );
  });
});

describe("validQuestion", () => {
  it("keeps a short question that sticks to the facts", () => {
    expect(validQuestion("What was playing on the drive in Kailua-Kona?", kona)).toBe(
      "What was playing on the drive in Kailua-Kona?"
    );
    expect(validQuestion('"Who was with you at the beach?"', kona)).toBe("Who was with you at the beach?");
  });

  it("rejects what isn't a clean question", () => {
    expect(validQuestion("That summer felt endless.", kona)).toBeNull();
    expect(validQuestion("What did I feel back then?", kona)).toBeNull(); // their voice
    expect(validQuestion("Was Maya with you that week?", kona)).toBeNull(); // invented person
    expect(validQuestion("What happened?\nTell me more?", kona)).toBeNull();
    expect(validQuestion(`${"Why ".repeat(30)}?`, kona)).toBeNull();
    expect(validQuestion(null, kona)).toBeNull();
  });
});

describe("templateQuestion", () => {
  it("uses the strongest fact", () => {
    expect(templateQuestion(kona)).toBe("What was playing while you were in Kailua-Kona?");
    expect(templateQuestion({ ...kona, away: false, place: null })).toBe(
      "What do you remember from that week at the beach?"
    );
    expect(templateQuestion({ song: "Holocene", artist: "Bon Iver", at: 0 })).toBe(
      "What was going on when you found Holocene?"
    );
  });
});
