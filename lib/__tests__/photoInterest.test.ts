import { describe, expect, it } from "vitest";
import type { PhotoAnalysis } from "../../modules/on-device-ai";
import { eventPhrase, eventsIn, interest, isBoring, lookAtWeek, lookBonus, sampleEvenly } from "../photoInterest";

const photo = (over: Partial<PhotoAnalysis> & { id: string }): PhotoAnalysis => ({
  labels: [],
  faces: 0,
  textCoverage: 0,
  ...over,
});

describe("isBoring", () => {
  it("catches homework, receipts and documents", () => {
    expect(isBoring(photo({ id: "u", utility: true }))).toBe(true);
    expect(isBoring(photo({ id: "t", textCoverage: 0.3 }))).toBe(true);
    expect(isBoring(photo({ id: "d", labels: [["document", 0.8]] }))).toBe(true);
  });

  it("keeps an ordinary photo, even with a little text in it", () => {
    expect(isBoring(photo({ id: "b", labels: [["beach", 0.9]], textCoverage: 0.02 }))).toBe(false);
    expect(isBoring(photo({ id: "w", labels: [["document", 0.3]] }))).toBe(false); // not sure enough
  });
});

describe("interest", () => {
  it("prefers good photos and people, and buries boring ones", () => {
    const plain = photo({ id: "a", aesthetic: 0.2 });
    const friends = photo({ id: "b", aesthetic: 0.2, faces: 3 });
    const receipt = photo({ id: "c", aesthetic: 0.9, utility: true });
    expect(interest(friends)).toBeGreaterThan(interest(plain));
    expect(interest(receipt)).toBeLessThan(interest(plain));
  });
});

describe("lookAtWeek", () => {
  it("names the event when photos agree and ranks the rest", () => {
    const week = [
      photo({ id: "1", labels: [["beach", 0.9]], aesthetic: 0.1 }),
      photo({ id: "2", labels: [["ocean", 0.7]], faces: 2, aesthetic: 0.5 }),
      photo({ id: "3", utility: true }),
      photo({ id: "4", labels: [["concert", 0.8]] }),
    ];
    const look = lookAtWeek(week);
    expect(look.event).toBe("beach");
    expect(look.boringShare).toBe(0.25);
    expect(look.groupShots).toBe(1);
    expect(look.bestIds[0]).toBe("2");
    expect(look.bestIds).not.toContain("3");
    expect(lookBonus(look)).toBeGreaterThan(1.5);
    expect(eventPhrase("beach")).toBe("at the beach");
  });

  it("doesn't call one photo an event", () => {
    expect(lookAtWeek([photo({ id: "1", labels: [["concert", 0.9]] }), photo({ id: "2" })]).event).toBeNull();
    expect(eventsIn(photo({ id: "x", labels: [["wedding", 0.6], ["party", 0.5]] }))).toEqual(["wedding", "party"]);
  });
});

describe("sampleEvenly", () => {
  it("spreads picks across the list", () => {
    expect(sampleEvenly([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([1, 3, 5, 7]);
    expect(sampleEvenly([1, 2], 4)).toEqual([1, 2]);
  });
});
