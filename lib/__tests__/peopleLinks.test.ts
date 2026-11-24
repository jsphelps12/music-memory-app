/**
 * "Who was there" with friends: friend suggestions (two Sams told apart,
 * names linked before), the name a picked friend goes on the moment as,
 * Rediscover's People grouped by the real person, and the share picker's
 * "Was there" first.
 */
import { describe, it, expect } from "vitest";
import {
  buildKnownNames,
  findPersonGroup,
  friendsForName,
  groupPeopleByPerson,
  linkedNamesByFriend,
  nameForFriend,
  offerAddTyped,
  suggestFriends,
  wasThereFirst,
  whoWasThereSuggestions,
  type FriendCandidate,
} from "../people";

const f = (
  id: string,
  displayName: string | null,
  username: string | null = null,
  extra: Partial<FriendCandidate> = {}
): FriendCandidate => ({ id, displayName, username, avatarPath: null, ...extra });

const samKim = f("f1", "Sam Kim", "samk");
const samLee = f("f2", "Sam Lee", "samlee");
const ana = f("f3", "Ana", "ana_b");

describe("suggestFriends", () => {
  it("finds every friend matching the name or @handle, exact first", () => {
    expect(suggestFriends([samLee, ana, samKim], "sam").map((x) => x.id)).toEqual(["f1", "f2"]);
    expect(suggestFriends([samLee, ana, samKim], "@ana_").map((x) => x.id)).toEqual(["f3"]);
    expect(suggestFriends([samLee, ana, samKim], "lee").map((x) => x.id)).toEqual(["f2"]);
  });

  it("finds a friend by a name linked to them before, and ranks them first", () => {
    const kim = { ...samKim, linkedNames: ["Sammy"], linkCount: 4 };
    expect(suggestFriends([samLee, kim], "sammy").map((x) => x.id)).toEqual(["f1"]);
    expect(suggestFriends([samLee, kim], "sam").map((x) => x.id)).toEqual(["f1", "f2"]);
    expect(suggestFriends([{ ...samLee, linkCount: 9 }, samKim], "sam").map((x) => x.id)).toEqual(["f2", "f1"]);
  });

  it("leaves out friends already linked on the moment, and nothing for no text", () => {
    expect(suggestFriends([samKim, samLee], "sam", ["f1"]).map((x) => x.id)).toEqual(["f2"]);
    expect(suggestFriends([samKim], "  ")).toEqual([]);
  });
});

describe("whoWasThereSuggestions", () => {
  const known = buildKnownNames([
    { people: ["Sam"], momentDate: "2026-01-01" },
    { people: ["Samantha"], momentDate: "2026-02-01" },
  ]);

  it("lists matching friends, then past names", () => {
    const rows = whoWasThereSuggestions({
      known,
      query: "sam",
      people: [],
      friends: [samKim, samLee],
      linkedFriendIds: [],
    });
    expect(rows.map((r) => `${r.kind}:${r.label}`)).toEqual([
      "friend:Sam Kim",
      "friend:Sam Lee",
      "name:Sam",
      "name:Samantha",
    ]);
  });

  it("still offers 'Add as a name' when only a friend matches the text", () => {
    const rows = whoWasThereSuggestions({
      known: [],
      query: "Sam Kim",
      people: [],
      friends: [samKim],
      linkedFriendIds: [],
    });
    expect(offerAddTyped("Sam Kim", [], rows)).toBe(true);
  });
});

describe("linkedNamesByFriend", () => {
  it("counts the names and moments per friend, most used first", () => {
    const usage = linkedNamesByFriend([
      { momentId: "m1", name: "Sam", friendId: "f1" },
      { momentId: "m2", name: "Samuel", friendId: "f1" },
      { momentId: "m3", name: "Samuel", friendId: "f1" },
      { momentId: "m1", name: "Ana", friendId: "f3" },
    ]);
    expect(usage.get("f1")).toEqual({ names: ["Samuel", "Sam"], count: 3 });
    expect(usage.get("f3")).toEqual({ names: ["Ana"], count: 1 });
  });
});

describe("nameForFriend", () => {
  const known = buildKnownNames([{ people: ["sam kim"], momentDate: "2026-01-01" }]);

  it("uses the name the owner usually links them as", () => {
    expect(nameForFriend({ friend: { ...samKim, linkedNames: ["Sammy"] }, people: [], links: [], known })).toEqual({
      name: "Sammy",
      existing: false,
    });
  });

  it("else their display name, in a past spelling when one matches", () => {
    expect(nameForFriend({ friend: samKim, people: [], links: [], known })).toEqual({ name: "sam kim", existing: false });
  });

  it("links a plain name already on the moment instead of adding it again", () => {
    expect(nameForFriend({ friend: samKim, people: ["Ana", "Sam Kim"], links: [], known: [] })).toEqual({
      name: "Sam Kim",
      existing: true,
    });
  });

  it("skips a name already linked to someone else, so two Sams stay two chips", () => {
    const people = ["Sam"];
    const links = [{ name: "Sam", friendId: "f2" }];
    const kim = { ...samKim, linkedNames: ["Sam"] };
    expect(nameForFriend({ friend: kim, people, links, known: [] })).toEqual({ name: "Sam Kim", existing: false });
  });

  it("falls back to the handle, and gives up only with no name at all", () => {
    expect(nameForFriend({ friend: f("x", null, "dj"), people: [], links: [], known: [] })).toEqual({
      name: "dj",
      existing: false,
    });
    expect(nameForFriend({ friend: f("x", null, null), people: [], links: [], known: [] })).toBeNull();
  });
});

describe("friendsForName", () => {
  it("puts friends matching the name first, then the rest in order", () => {
    expect(friendsForName([ana, samLee, samKim], "Sam").map((x) => x.id)).toEqual(["f1", "f2", "f3"]);
  });
});

describe("groupPeopleByPerson", () => {
  const moments = [
    { id: "m1", people: ["Sam", "Ana"] },
    { id: "m2", people: ["Samuel"] },
    { id: "m3", people: ["Sam"] }, // an older moment, never linked
    { id: "m4", people: ["Jo"] },
  ];

  it("groups the names linked to one friend as one person", () => {
    const groups = groupPeopleByPerson(moments, [
      { momentId: "m1", name: "Sam", friendId: "f1" },
      { momentId: "m2", name: "Samuel", friendId: "f1" },
    ]);
    expect(groups[0]).toMatchObject({ key: "friend:f1", friendId: "f1", label: "Sam", momentIds: ["m1", "m2", "m3"] });
    expect(groups[0].names).toEqual(["Sam", "Samuel"]);
    expect(groups.map((g) => g.key)).toEqual(["friend:f1", "name:Ana", "name:Jo"]);
  });

  it("is the old per-name list when nothing is linked", () => {
    const groups = groupPeopleByPerson(moments, []);
    expect(groups.map((g) => [g.key, g.momentIds.length])).toEqual([
      ["name:Sam", 2],
      ["name:Ana", 1],
      ["name:Samuel", 1],
      ["name:Jo", 1],
    ]);
  });

  it("keeps a name linked to two different friends apart", () => {
    const groups = groupPeopleByPerson(moments, [
      { momentId: "m1", name: "Sam", friendId: "f1" },
      { momentId: "m3", name: "Sam", friendId: "f2" },
      { momentId: "m2", name: "Samuel", friendId: "f2" },
    ]);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.momentIds]));
    expect(byKey["friend:f1"]).toEqual(["m1"]);
    expect(byKey["friend:f2"]).toEqual(["m2", "m3"]);
  });

  it("leaves an unlinked use of an ambiguous name as text", () => {
    const groups = groupPeopleByPerson(
      [...moments, { id: "m5", people: ["Sam"] }],
      [
        { momentId: "m1", name: "Sam", friendId: "f1" },
        { momentId: "m3", name: "Sam", friendId: "f2" },
      ]
    );
    expect(groups.find((g) => g.key === "name:Sam")?.momentIds).toEqual(["m5"]);
  });

  it("ignores links to someone who isn't a friend any more", () => {
    const groups = groupPeopleByPerson(moments, [{ momentId: "m1", name: "Sam", friendId: "gone" }], new Set(["f1"]));
    expect(groups[0].key).toBe("name:Sam");
  });
});

describe("findPersonGroup", () => {
  const groups = groupPeopleByPerson(
    [
      { id: "m1", people: ["Sam"] },
      { id: "m2", people: ["Samuel", "Ana"] },
    ],
    [
      { momentId: "m1", name: "Sam", friendId: "f1" },
      { momentId: "m2", name: "Samuel", friendId: "f1" },
    ]
  );

  it("finds a friend's group by id, or by any name linked to them", () => {
    expect(findPersonGroup(groups, { friendId: "f1" })?.key).toBe("friend:f1");
    expect(findPersonGroup(groups, { name: "Samuel" })?.key).toBe("friend:f1");
  });

  it("finds a plain name's group, and nothing for an unknown name", () => {
    expect(findPersonGroup(groups, { name: "Ana" })?.key).toBe("name:Ana");
    expect(findPersonGroup(groups, { name: "Zed" })).toBeUndefined();
  });
});

describe("wasThereFirst", () => {
  it("puts the friends linked on the moment first, each part in its order", () => {
    const people = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(wasThereFirst(people, new Set(["c", "a"]))).toEqual({
      people: [{ id: "a" }, { id: "c" }, { id: "b" }, { id: "d" }],
      wasThereCount: 2,
    });
    expect(wasThereFirst(people, new Set()).wasThereCount).toBe(0);
  });
});
