/**
 * `mapShareRow` is the DB→TypeScript mapping for a moment_shares row with its
 * PostgREST-embedded moment. The embedded row is card-column-shaped
 * (MOMENT_CARD_COLUMNS), so the interesting behaviour mirrors the
 * moments.test.ts contract: the mapped Moment fabricates defaults for columns
 * the card list never fetches, and the sender's display name rides in through
 * `contributorName` — the same field shared-album cards use for attribution.
 */
import { describe, it, expect, vi } from "vitest";

// momentShares.ts imports the supabase client (which transitively imports
// react-native) for its fetch functions; mapShareRow itself never touches it.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { mapShareRow } from "../momentShares";

/** A moment_shares row as fetchSharedWithMe's select returns it. */
function shareRow(overrides: Record<string, any> = {}) {
  return {
    id: "share-1",
    sender_id: "sender-uuid",
    created_at: "2026-08-01T10:00:00Z",
    viewed_at: null,
    moments: {
      id: "m1",
      user_id: "sender-uuid",
      moment_date: "2026-07-04",
      created_at: "2026-07-04T22:00:00Z",
      song_title: "September",
      song_artist: "Earth, Wind & Fire",
      song_album_name: "The Best of Earth, Wind & Fire, Vol. 1",
      song_artwork_url: "https://example.com/art.jpg",
      song_provider: "apple_music",
      song_apple_music_id: "300969034",
      song_spotify_id: null,
      song_preview_url: "https://example.com/preview.m4a",
      mood: "joyful",
      moods: ["joyful"],
      photo_urls: ["sender-uuid/a.jpg"],
      photo_thumbnails: ["sender-uuid/thumb_a.jpg"],
      reflection_text: "Dancing in the kitchen.",
      guest_name: null,
      guest_uuid: null,
    },
    ...overrides,
  };
}

describe("mapShareRow", () => {
  it("maps share fields and attaches the sender name as contributorName", () => {
    const shared = mapShareRow(shareRow(), "Josh");
    expect(shared.shareId).toBe("share-1");
    expect(shared.senderId).toBe("sender-uuid");
    expect(shared.sharedAt).toBe("2026-08-01T10:00:00Z");
    expect(shared.viewedAt).toBeNull();
    expect(shared.moment.id).toBe("m1");
    expect(shared.moment.songTitle).toBe("September");
    expect(shared.moment.userId).toBe("sender-uuid");
    expect(shared.moment.contributorName).toBe("Josh");
  });

  it("keeps viewed_at when set", () => {
    const shared = mapShareRow(shareRow({ viewed_at: "2026-08-01T11:00:00Z" }), "Josh");
    expect(shared.viewedAt).toBe("2026-08-01T11:00:00Z");
  });

  it("leaves contributorName unset when the sender has no display name", () => {
    const shared = mapShareRow(shareRow(), null);
    // A nameless sender must not fabricate an attribution badge on the card.
    expect(shared.moment.contributorName).toBeUndefined();
  });

  it("fabricates card-shape defaults exactly like the timeline mapper", () => {
    const shared = mapShareRow(shareRow(), "Josh");
    // Columns MOMENT_CARD_COLUMNS never fetches come back defaulted, not undefined.
    expect(shared.moment.people).toEqual([]);
    expect(shared.moment.shareToken).toBeNull();
    expect(shared.moment.moods).toEqual(["joyful"]);
  });
});
