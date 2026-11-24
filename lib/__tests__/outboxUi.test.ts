/**
 * The words around offline saves and the analytics they send: a pending card
 * never reads as a failure, a refused one says so, sign-out asks only when
 * something would be lost (and when it can't tell), and the events carry
 * counts and flags, never the person's words.
 */
import { describe, it, expect } from "vitest";
import {
  momentCreatedProperties,
  momentQueuedProperties,
  outboxCardStatus,
  PENDING_LABEL,
  REJECTED_LABEL,
  signOutOutboxAsk,
  type MomentShape,
} from "../outboxUi";
import type { Song } from "@/types";

const song: Song = {
  id: "s1",
  title: "Dreams",
  artistName: "Fleetwood Mac",
  albumName: "Rumours",
  artworkUrl: "https://example.com/a.jpg",
  provider: "apple_music",
  appleMusicId: "1",
  spotifyId: null,
  durationMs: 1000,
};

const moment: MomentShape = {
  song,
  reflection: "  The drive home after graduation  ",
  moods: ["nostalgic", "happy"],
  photos: ["file:///a.jpg", "file:///b.jpg"],
  locationResult: { name: "Denver", lat: 1, lng: 2 },
  people: ["Sam"],
  peopleLinks: [],
  selectedAlbum: null,
  captureSource: "search",
};

describe("outboxCardStatus", () => {
  it("waiting on its own: saves when back online, for every non-rejected kind", () => {
    for (const lastErrorKind of [undefined, "offline", "server"] as const) {
      expect(outboxCardStatus({ lastErrorKind })).toEqual({ rejected: false, label: PENDING_LABEL, reason: null });
    }
  });

  it("rejected: couldn't save, with the friendly reason", () => {
    expect(outboxCardStatus({ lastErrorKind: "rejected", lastError: "Something went wrong." })).toEqual({
      rejected: true,
      label: REJECTED_LABEL,
      reason: "Something went wrong.",
    });
  });

  it("rejected without a reason has none", () => {
    expect(outboxCardStatus({ lastErrorKind: "rejected", lastError: "  " }).reason).toBeNull();
    expect(outboxCardStatus({ lastErrorKind: "rejected" }).reason).toBeNull();
  });
});

describe("signOutOutboxAsk", () => {
  it("doesn't ask with nothing waiting", () => {
    expect(signOutOutboxAsk(0)).toBeNull();
  });

  it("counts what would be lost", () => {
    expect(signOutOutboxAsk(2)).toEqual({
      title: "2 moments haven't saved yet",
      message: "They're only on this phone. Signing out deletes them.",
      confirmLabel: "Sign out anyway",
      cancelLabel: "Stay signed in",
      destructive: true,
    });
    expect(signOutOutboxAsk(1)?.title).toBe("1 moment hasn't saved yet");
    expect(signOutOutboxAsk(1)?.message).toBe("It's only on this phone. Signing out deletes it.");
  });

  it("asks anyway when the outbox couldn't be read", () => {
    expect(signOutOutboxAsk(null)?.title).toBe("Some moments haven't saved yet");
    expect(signOutOutboxAsk(null)?.confirmLabel).toBe("Sign out anyway");
  });
});

describe("momentCreatedProperties", () => {
  it("matches what capture has always sent", () => {
    expect(momentCreatedProperties(moment)).toEqual({
      song_title: "Dreams",
      song_artist: "Fleetwood Mac",
      has_reflection: true,
      has_mood: true,
      mood_count: 2,
      photo_count: 2,
      has_location: true,
      has_people: true,
      has_people_links: false,
      has_collection: false,
      capture_source: "search",
    });
  });

  it("never carries the writing or people's names", () => {
    const text = JSON.stringify(momentCreatedProperties(moment));
    expect(text).not.toContain("graduation");
    expect(text).not.toContain("Sam");
  });

  it("reads a stored outbox item with missing optional fields", () => {
    const sparse = { song, reflection: "", moods: [], photos: [], locationResult: null, people: [] } as MomentShape;
    expect(momentCreatedProperties(sparse)).toMatchObject({
      has_reflection: false,
      has_people_links: false,
      has_collection: false,
      capture_source: null,
    });
  });
});

describe("momentQueuedProperties", () => {
  it("counts and flags only, with why it was queued", () => {
    const props = momentQueuedProperties(moment, "offline");
    expect(props).toEqual({
      reason: "offline",
      photo_count: 2,
      mood_count: 2,
      has_reflection: true,
      has_collection: false,
      capture_source: "search",
    });
    expect(JSON.stringify(props)).not.toContain("Dreams");
    expect(momentQueuedProperties(moment, "save_failed").reason).toBe("save_failed");
  });
});
