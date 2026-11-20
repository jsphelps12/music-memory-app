// The album_invite push (album basics, 2026-11-20). Pure, so vitest covers it
// (albumInviteCopy.test.ts).
//
// The album's name is not in the push. It's the owner's own text, and an
// album can be named for something private ("Dad's last summer"); CLAUDE.md:
// pushes never carry the user's own words. The invite itself, with the album
// name, waits in Albums → Shared.

/** How long after the invite a push may still go out (the app calls right after inviting). */
export const ALBUM_INVITE_PUSH_WINDOW_MS = 5 * 60 * 1000;

const NAME_MAX = 40;

function clipName(name: string | null | undefined): string {
  const t = (name ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "Someone";
  return t.length > NAME_MAX ? `${t.slice(0, NAME_MAX - 1)}…` : t;
}

export function albumInvitePush(
  senderName: string | null | undefined,
  collectionId: string
): { title: string; body: string; data: { type: "album_invite"; collectionId: string } } {
  return {
    title: "Album invite",
    body: `${clipName(senderName)} invited you to an album`,
    data: { type: "album_invite", collectionId },
  };
}

/** Whether an invite made at `createdAt` is still new enough to announce. */
export function inviteIsFresh(createdAt: string | null | undefined, now: number): boolean {
  const at = Date.parse(createdAt ?? "");
  return Number.isFinite(at) && now - at <= ALBUM_INVITE_PUSH_WINDOW_MS;
}
