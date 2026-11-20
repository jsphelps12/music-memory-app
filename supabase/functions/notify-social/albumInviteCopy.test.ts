import { describe, expect, it } from "vitest";
import { ALBUM_INVITE_PUSH_WINDOW_MS, albumInvitePush, inviteIsFresh } from "./albumInviteCopy";

const ID = "11111111-2222-3333-4444-555555555555";

describe("albumInvitePush", () => {
  it("names the sender, never the album", () => {
    const push = albumInvitePush("Sam", ID);
    expect(push.title).toBe("Album invite");
    expect(push.body).toBe("Sam invited you to an album");
    expect(push.data).toEqual({ type: "album_invite", collectionId: ID });
  });

  it("falls back to Someone and tidies long or messy names", () => {
    expect(albumInvitePush(null, ID).body).toBe("Someone invited you to an album");
    expect(albumInvitePush("   ", ID).body).toBe("Someone invited you to an album");
    expect(albumInvitePush("  Sam \n Lee ", ID).body).toBe("Sam Lee invited you to an album");
    const long = albumInvitePush("x".repeat(60), ID).body;
    expect(long.startsWith(`${"x".repeat(39)}… invited`)).toBe(true);
  });
});

describe("inviteIsFresh", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  it("announces an invite only within the window", () => {
    expect(inviteIsFresh("2026-11-21T11:58:00Z", now)).toBe(true);
    expect(inviteIsFresh(new Date(now - ALBUM_INVITE_PUSH_WINDOW_MS).toISOString(), now)).toBe(true);
    expect(inviteIsFresh(new Date(now - ALBUM_INVITE_PUSH_WINDOW_MS - 1).toISOString(), now)).toBe(false);
    expect(inviteIsFresh(null, now)).toBe(false);
    expect(inviteIsFresh("not a date", now)).toBe(false);
  });
});
