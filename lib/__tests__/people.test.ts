/**
 * Person lists: picker order (recent sends, then A–Z), search (word prefix,
 * accents and case ignored), reverse-pair dedupe, id batching, and the
 * "Who was there" name rules (one spelling per name, ignoring case).
 */
import { describe, it, expect } from "vitest";
import {
  buildKnownNames,
  chunk,
  compareByName,
  dedupeByOtherUser,
  filterPeople,
  hasName,
  idsNeedingHandle,
  matchesQuery,
  nameKey,
  normalizeName,
  offerAddTyped,
  peopleSuggestions,
  personLabel,
  rankPeople,
  recentNames,
  resolveName,
  suggestNames,
} from "../people";

const p = (id: string, displayName: string | null, username: string | null = null) => ({ id, displayName, username });

describe("chunk", () => {
  it("splits into runs of at most the size, in order", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
    expect(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("rejects a size below 1", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("normalizeName / nameKey", () => {
  it("normalizeName drops case, accents and extra spaces", () => {
    expect(normalizeName("  José   María ")).toBe("jose maria");
    expect(normalizeName("ZOË")).toBe("zoe");
    expect(normalizeName(null)).toBe("");
  });

  it("nameKey ignores case and spacing but keeps accents", () => {
    expect(nameKey(" Sam  Kim ")).toBe("sam kim");
    expect(nameKey("SAM")).toBe(nameKey("sam"));
    expect(nameKey("Zoë")).not.toBe(nameKey("Zoe"));
  });
});

describe("matchesQuery", () => {
  it("matches the start of any word", () => {
    expect(matchesQuery(["Sam Kim"], "sa")).toBe(true);
    expect(matchesQuery(["Sam Kim"], "ki")).toBe(true);
    expect(matchesQuery(["Lisa Sanders"], "san")).toBe(true);
    expect(matchesQuery(["Lisa"], "sa")).toBe(false);
  });

  it("ignores case and accents both ways", () => {
    expect(matchesQuery(["José"], "jose")).toBe(true);
    expect(matchesQuery(["Jose"], "JOSÉ")).toBe(true);
    expect(matchesQuery(["Zoë Ng"], "zoe n")).toBe(true);
  });

  it("matches handles, with or without the @", () => {
    expect(matchesQuery([null, "samk"], "@sam")).toBe(true);
    expect(matchesQuery([null, "mary-jane"], "jane")).toBe(true);
  });

  it("matches everyone on an empty query", () => {
    expect(matchesQuery(["Anyone"], "  ")).toBe(true);
    expect(matchesQuery([null], "@")).toBe(true);
  });
});

describe("rankPeople", () => {
  const people = [p("1", "zed"), p("2", "Amy"), p("3", null, "nohandle"), p("4", null), p("5", "Émile"), p("6", "bob")];

  it("orders A–Z ignoring case and accents, nameless last", () => {
    expect(rankPeople(people).map((x) => x.id)).toEqual(["2", "6", "5", "3", "1", "4"]);
  });

  it("puts recent recipients first, newest send on top", () => {
    const sent = new Map([
      ["1", "2026-11-01T00:00:00Z"],
      ["6", "2026-11-18T00:00:00Z"],
    ]);
    expect(rankPeople(people, sent).map((x) => x.id)).toEqual(["6", "1", "2", "5", "3", "4"]);
  });

  it("does not change the input", () => {
    const copy = [...people];
    rankPeople(people, new Map([["4", "2026-01-01"]]));
    expect(people).toEqual(copy);
  });

  it("compareByName breaks a tie by id so the order is stable", () => {
    expect(compareByName(p("b", "Sam"), p("a", "sam"))).toBeGreaterThan(0);
  });
});

describe("filterPeople / idsNeedingHandle / personLabel", () => {
  it("filters by name or handle and keeps the order", () => {
    const list = [p("1", "Sam Kim", "skim"), p("2", "Alex", "sammy"), p("3", "Bo")];
    expect(filterPeople(list, "sam").map((x) => x.id)).toEqual(["1", "2"]);
    expect(filterPeople(list, "").map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("flags people who share a name", () => {
    const ids = idsNeedingHandle([p("1", "Sam"), p("2", "sam "), p("3", "Sammy"), p("4", null), p("5", null)]);
    expect([...ids].sort()).toEqual(["1", "2"]);
  });

  it("labels a person by name, else handle, else Someone", () => {
    expect(personLabel({ displayName: " Sam ", username: "s" })).toBe("Sam");
    expect(personLabel({ displayName: null, username: "s" })).toBe("@s");
    expect(personLabel({ displayName: "  ", username: null })).toBe("Someone");
  });
});

describe("dedupeByOtherUser", () => {
  it("keeps the oldest row for a reverse-pair duplicate, in input order", () => {
    const rows = [
      { id: "f2", otherUserId: "b", createdAt: "2026-02-01" },
      { id: "f1", otherUserId: "a", createdAt: "2026-01-01" },
      { id: "f3", otherUserId: "b", createdAt: "2026-01-15" },
    ];
    expect(dedupeByOtherUser(rows).map((r) => r.id)).toEqual(["f1", "f3"]);
  });
});

describe("Who was there names", () => {
  const moments = [
    { people: ["Sam", "Alex"], momentDate: "2026-10-01" },
    { people: ["Sam"], momentDate: "2026-09-01" },
    { people: ["sam ", "José"], momentDate: "2026-11-01" },
    { people: ["Rae"], momentDate: null },
  ];

  it("merges spellings ignoring case into the most used one", () => {
    const known = buildKnownNames(moments);
    const sam = known.find((k) => k.key === "sam")!;
    expect(sam).toMatchObject({ name: "Sam", count: 3, lastUsed: "2026-11-01", friend: false });
  });

  it("adds friends' display names, marking ones already used", () => {
    const known = buildKnownNames(moments, ["sam", "Priya", null, "  "]);
    expect(known.find((k) => k.key === "sam")).toMatchObject({ name: "Sam", friend: true });
    expect(known.find((k) => k.key === "priya")).toMatchObject({ name: "Priya", count: 0, friend: true });
    expect(known).toHaveLength(5);
  });

  it("resolves a typed name to the existing spelling", () => {
    const known = buildKnownNames(moments);
    expect(resolveName("sAM", known)).toBe("Sam");
    expect(resolveName("  new   person ", known)).toBe("new person");
  });

  it("hasName ignores case and spacing", () => {
    expect(hasName(["Sam"], " sam")).toBe(true);
    expect(hasName(["Sam"], "Samuel")).toBe(false);
    expect(hasName(["Sam"], "  ")).toBe(false);
  });

  it("suggests matches, exact first, skipping names already on the moment", () => {
    const known = buildKnownNames(
      [...moments, { people: ["Samira"], momentDate: "2026-11-10" }, { people: ["Lisa Sams"], momentDate: null }],
      ["Sammy"]
    );
    expect(suggestNames(known, "sam", []).map((k) => k.name)).toEqual(["Sam", "Samira", "Sammy", "Lisa Sams"]);
    expect(suggestNames(known, "sam", ["SAM"]).map((k) => k.name)).toEqual(["Samira", "Sammy", "Lisa Sams"]);
    expect(suggestNames(known, "jose", []).map((k) => k.name)).toEqual(["José"]);
    expect(suggestNames(known, "", [])).toEqual([]);
    expect(suggestNames(known, "sam", [], 2)).toHaveLength(2);
  });

  it("lists recent names newest first, leaving out unused friends", () => {
    const known = buildKnownNames(moments, ["Priya"]);
    expect(recentNames(known, []).map((k) => k.name)).toEqual(["Sam", "José", "Alex", "Rae"]);
    expect(recentNames(known, ["sam"], 2).map((k) => k.name)).toEqual(["José", "Alex"]);
  });

  it("shapes suggestions as typed rows and offers Add only for a new name", () => {
    const known = buildKnownNames(moments);
    const rows = peopleSuggestions(known, "sa", []);
    expect(rows).toEqual([{ kind: "name", key: "name:sam", label: "Sam" }]);
    expect(offerAddTyped("sam", [], rows)).toBe(false); // the suggestion is the same name
    expect(offerAddTyped("Sa", [], rows)).toBe(true);
    expect(offerAddTyped("alex", ["Alex"], [])).toBe(false); // already on the moment
    expect(offerAddTyped("  ", [], [])).toBe(false);
  });
});
