/**
 * lib/albumInvites.ts: which invites Albums → Shared shows, the picker's row
 * states, and the "server doesn't have this yet" check that keeps the feature
 * hidden until the migration is applied.
 */
import { describe, expect, it } from "vitest";
import {
  inviteCandidates,
  inviteClosedMessage,
  inviteFromLine,
  inviteRowState,
  isMissingInviteBackend,
  mapPendingInvites,
  parseRespondStatus,
  pendingInviteCount,
  type PendingInviteRow,
} from "../albumInvites";

function invite(overrides: Partial<PendingInviteRow> = {}): PendingInviteRow {
  return {
    collection_id: "a1",
    from_user: "sam",
    created_at: "2026-11-20T10:00:00Z",
    collections: { id: "a1", name: "Road Trip", cover_photo_url: null, is_public: true },
    ...overrides,
  };
}

describe("isMissingInviteBackend", () => {
  it("recognises a missing table or function", () => {
    for (const code of ["42P01", "PGRST205", "PGRST202", "42883"]) {
      expect(isMissingInviteBackend({ code })).toBe(true);
    }
  });

  it("treats anything else as a real failure", () => {
    expect(isMissingInviteBackend({ code: "42501" })).toBe(false);
    expect(isMissingInviteBackend({ code: null })).toBe(false);
    expect(isMissingInviteBackend(null)).toBe(false);
    expect(isMissingInviteBackend(undefined)).toBe(false);
  });
});

describe("mapPendingInvites", () => {
  const names = new Map([["sam", "Sam"]]);

  it("maps a row with its album and the sender's name", () => {
    expect(mapPendingInvites([invite({ collections: { name: "Road Trip", cover_photo_url: "u/c.jpg", is_public: true } })], new Set(), names)).toEqual([
      {
        collectionId: "a1",
        albumName: "Road Trip",
        coverPhotoUrl: "u/c.jpg",
        fromUserId: "sam",
        fromName: "Sam",
        createdAt: "2026-11-20T10:00:00Z",
      },
    ]);
  });

  it("drops albums that are gone, private, or already joined or owned", () => {
    const rows = [
      invite({ collection_id: "gone", collections: null }),
      invite({ collection_id: "private", collections: { name: "P", is_public: false } }),
      invite({ collection_id: "joined" }),
      invite({ collection_id: "keep" }),
    ];
    const out = mapPendingInvites(rows, new Set(["joined"]), names);
    expect(out.map((i) => i.collectionId)).toEqual(["keep"]);
  });

  it("shows one per album, newest first, with no name when the lookup missed", () => {
    const rows = [
      invite({ collection_id: "old", created_at: "2026-11-01T00:00:00Z", from_user: "x" }),
      invite({ collection_id: "new", created_at: "2026-11-19T00:00:00Z" }),
      invite({ collection_id: "new", created_at: "2026-11-18T00:00:00Z" }),
    ];
    const out = mapPendingInvites(rows, new Set(), names);
    expect(out.map((i) => i.collectionId)).toEqual(["new", "old"]);
    expect(out[1].fromName).toBeNull();
  });

  it("counts what it would show", () => {
    expect(pendingInviteCount([invite(), invite({ collection_id: "a2" }), invite({ collection_id: "x", collections: null })], new Set(["a2"]))).toBe(1);
    expect(pendingInviteCount([], new Set())).toBe(0);
  });
});

describe("inviteFromLine", () => {
  it("names the sender, or says a friend", () => {
    expect(inviteFromLine("Sam")).toBe("From Sam");
    expect(inviteFromLine("  ")).toBe("From a friend");
    expect(inviteFromLine(null)).toBe("From a friend");
  });
});

describe("inviteClosedMessage", () => {
  it("says why Join didn't join", () => {
    expect(inviteClosedMessage("unavailable")).toBe("This album isn't taking new members anymore.");
    expect(inviteClosedMessage("no_invite")).toBe("This invite isn't open anymore.");
  });
});

describe("parseRespondStatus", () => {
  it("passes known answers through and reads anything else as a used-up invite", () => {
    expect(parseRespondStatus("joined")).toBe("joined");
    expect(parseRespondStatus("declined")).toBe("declined");
    expect(parseRespondStatus("unavailable")).toBe("unavailable");
    expect(parseRespondStatus("no_invite")).toBe("no_invite");
    expect(parseRespondStatus(null)).toBe("no_invite");
    expect(parseRespondStatus(3)).toBe("no_invite");
  });
});

describe("invite picker", () => {
  it("shows a spinner while inviting, Invited after, and Invite otherwise", () => {
    const invited = new Set(["a"]);
    const inviting = new Set(["b"]);
    expect(inviteRowState("a", invited, inviting)).toBe("invited");
    expect(inviteRowState("b", invited, inviting)).toBe("inviting");
    expect(inviteRowState("c", invited, inviting)).toBe("available");
  });

  it("leaves out the owner and current members, keeping the order", () => {
    const friends = [{ id: "me" }, { id: "x" }, { id: "member" }, { id: "y" }];
    expect(inviteCandidates(friends, "me", new Set(["member"])).map((f) => f.id)).toEqual(["x", "y"]);
  });
});
