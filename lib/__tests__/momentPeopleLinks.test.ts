/**
 * "Who was there" links: what a save writes (diffing, names that left the
 * moment), and that a database without the table behaves as before links
 * existed (reads say unavailable, writes are skipped).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const sb = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("./helpers/supabaseMock");
  return createSupabaseMock();
});
vi.mock("@/lib/supabase", () => ({ supabase: sb.client }));

import {
  diffPeopleLinks,
  fetchMomentPeopleLinks,
  fetchPeopleLinks,
  isMissingRelationError,
  linkForName,
  linksForMoment,
  normalizeLinks,
  syncMomentPeopleLinks,
} from "../momentPeopleLinks";

const MISSING_TABLE = {
  code: "PGRST205",
  message: "Could not find the table 'public.moment_people_links' in the schema cache",
};

beforeEach(() => sb.reset());

const calls = (method: string) =>
  sb.queries.flatMap((q) => q.chain).filter((c) => c.method === method);

describe("isMissingRelationError", () => {
  it("knows PostgREST's and Postgres's missing-table errors", () => {
    expect(isMissingRelationError(MISSING_TABLE)).toBe(true);
    expect(isMissingRelationError({ code: "42P01", message: "x" })).toBe(true);
    expect(isMissingRelationError({ message: 'relation "public.moment_people_links" does not exist' })).toBe(true);
  });

  it("doesn't mistake other errors for it", () => {
    expect(isMissingRelationError({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(isMissingRelationError({ code: "PGRST204", message: "Could not find the 'x' column" })).toBe(false);
    expect(isMissingRelationError(null)).toBe(false);
    expect(isMissingRelationError("boom")).toBe(false);
  });
});

describe("normalizeLinks", () => {
  it("keeps links whose name is on the moment, in the moment's spelling", () => {
    expect(normalizeLinks(["Sam", "Ana"], [{ name: " sam ", friendId: "f1" }])).toEqual([
      { name: "Sam", friendId: "f1" },
    ]);
  });

  it("drops links for names no longer on the moment", () => {
    expect(normalizeLinks(["Ana"], [{ name: "Sam", friendId: "f1" }])).toEqual([]);
  });

  it("links each friend and each name once (the first wins)", () => {
    expect(
      normalizeLinks(
        ["Sam", "Samuel"],
        [
          { name: "Sam", friendId: "f1" },
          { name: "Samuel", friendId: "f1" },
          { name: "sam", friendId: "f2" },
        ]
      )
    ).toEqual([{ name: "Sam", friendId: "f1" }]);
  });
});

describe("diffPeopleLinks", () => {
  it("adds new friends, renames moved ones and removes the rest", () => {
    const before = [
      { name: "Sam", friendId: "f1" },
      { name: "Ana", friendId: "f2" },
      { name: "Jo", friendId: "f3" },
    ];
    const after = [
      { name: "Sam", friendId: "f1" },
      { name: "Annie", friendId: "f2" },
      { name: "Lee", friendId: "f4" },
    ];
    expect(diffPeopleLinks(before, after)).toEqual({
      upsert: [
        { name: "Annie", friendId: "f2" },
        { name: "Lee", friendId: "f4" },
      ],
      remove: ["f3"],
    });
  });

  it("is empty when nothing changed", () => {
    const links = [{ name: "Sam", friendId: "f1" }];
    expect(diffPeopleLinks(links, links)).toEqual({ upsert: [], remove: [] });
  });
});

describe("linkForName / linksForMoment", () => {
  it("finds a link by name ignoring case and spacing", () => {
    expect(linkForName([{ name: "Sam", friendId: "f1" }], "  SAM ")).toEqual({ name: "Sam", friendId: "f1" });
    expect(linkForName([{ name: "Sam", friendId: "f1" }], "")).toBeUndefined();
  });

  it("picks one moment's links out of the whole set", () => {
    const all = [
      { momentId: "m1", name: "Sam", friendId: "f1" },
      { momentId: "m2", name: "Ana", friendId: "f2" },
    ];
    expect(linksForMoment(all, "m2")).toEqual([{ name: "Ana", friendId: "f2" }]);
  });
});

describe("fetchPeopleLinks", () => {
  it("reads the owner's links in primary-key order", async () => {
    sb.queueData([{ moment_id: "m1", name: "Sam", friend_id: "f1" }]);
    const result = await fetchPeopleLinks("u1");
    expect(result).toEqual({ available: true, links: [{ momentId: "m1", name: "Sam", friendId: "f1" }] });
    expect(sb.queries[0].table).toBe("moment_people_links");
    expect(sb.queries[0].chain.map((c) => c.method)).toEqual(["select", "eq", "order", "order", "range"]);
    expect(sb.queries[0].chain[1].args).toEqual(["owner_id", "u1"]);
  });

  it("says unavailable, not an error, before the migration", async () => {
    sb.queueError(MISSING_TABLE);
    await expect(fetchPeopleLinks("u1")).resolves.toEqual({ available: false, links: [] });
  });

  it("throws other errors", async () => {
    sb.queueError({ message: "network", code: "" });
    await expect(fetchPeopleLinks("u1")).rejects.toMatchObject({ message: "network" });
  });
});

describe("fetchMomentPeopleLinks", () => {
  it("reads one moment's links", async () => {
    sb.queueData([{ moment_id: "m1", name: "Sam", friend_id: "f1" }]);
    await expect(fetchMomentPeopleLinks("m1", "u1")).resolves.toEqual({
      available: true,
      links: [{ name: "Sam", friendId: "f1" }],
    });
  });

  it("says unavailable before the migration", async () => {
    sb.queueError(MISSING_TABLE);
    await expect(fetchMomentPeopleLinks("m1", "u1")).resolves.toEqual({ available: false, links: [] });
  });
});

describe("syncMomentPeopleLinks", () => {
  const base = { momentId: "m1", ownerId: "u1" };

  it("writes nothing when nothing changed", async () => {
    const links = [{ name: "Sam", friendId: "f1" }];
    await expect(syncMomentPeopleLinks({ ...base, people: ["Sam"], before: links, after: links })).resolves.toBe(
      "unchanged"
    );
    expect(sb.queries).toHaveLength(0);
  });

  it("deletes removed links, then upserts new ones", async () => {
    const outcome = await syncMomentPeopleLinks({
      ...base,
      people: ["Sam", "Ana"],
      before: [{ name: "Jo", friendId: "f3" }],
      after: [
        { name: "Sam", friendId: "f1" },
        { name: "Jo", friendId: "f3" }, // Jo is no longer on the moment
      ],
    });
    expect(outcome).toBe("saved");
    expect(sb.queries.map((q) => q.chain[0].method)).toEqual(["delete", "upsert"]);
    expect(calls("in")[0].args).toEqual(["friend_id", ["f3"]]);
    expect(calls("upsert")[0].args).toEqual([
      [{ moment_id: "m1", owner_id: "u1", name: "Sam", friend_id: "f1" }],
      { onConflict: "moment_id,friend_id" },
    ]);
  });

  it("is skipped when the table isn't there yet", async () => {
    sb.queueError(MISSING_TABLE);
    await expect(
      syncMomentPeopleLinks({ ...base, people: ["Sam"], before: [], after: [{ name: "Sam", friendId: "f1" }] })
    ).resolves.toBe("unavailable");
  });

  it("throws any other failure for the caller to log", async () => {
    sb.queueError({ code: "42501", message: "new row violates row-level security policy" });
    await expect(
      syncMomentPeopleLinks({ ...base, people: ["Sam"], before: [], after: [{ name: "Sam", friendId: "f1" }] })
    ).rejects.toMatchObject({ code: "42501" });
  });
});
