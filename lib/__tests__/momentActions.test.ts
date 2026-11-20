import { describe, expect, it, vi } from "vitest";
import {
  REMOVE_FROM_ALBUM_CONFIRM,
  canRemoveFromAlbum,
  cardMenuKeys,
  removeFromAlbumConfirm,
  shouldStopForDeletedMoment,
  stopSongOfDeletedMoment,
} from "../momentActions";
import type { Song } from "@/types";

function song(ids: { spotifyId?: string | null; appleMusicId?: string | null }): Song {
  return {
    id: ids.spotifyId ?? ids.appleMusicId ?? "",
    title: "T",
    artistName: "A",
    albumName: "",
    artworkUrl: "",
    provider: ids.spotifyId ? "spotify" : "apple_music",
    appleMusicId: ids.appleMusicId ?? null,
    spotifyId: ids.spotifyId ?? null,
    durationMs: 0,
  };
}

describe("shouldStopForDeletedMoment", () => {
  it("stops when the deleted moment's song is loaded", () => {
    expect(shouldStopForDeletedMoment({ songAppleMusicId: "123" }, song({ appleMusicId: "123" }))).toBe(true);
    expect(shouldStopForDeletedMoment({ songSpotifyId: "sp", songAppleMusicId: "123" }, song({ spotifyId: "sp" }))).toBe(true);
  });

  it("leaves another song alone", () => {
    expect(shouldStopForDeletedMoment({ songAppleMusicId: "123" }, song({ appleMusicId: "456" }))).toBe(false);
  });

  it("with nothing loaded, stops only when asked to cancel a pending start", () => {
    expect(shouldStopForDeletedMoment({ songAppleMusicId: "123" }, null)).toBe(false);
    expect(shouldStopForDeletedMoment({ songAppleMusicId: "123" }, null, { orIdle: true })).toBe(true);
  });

  it("never stops for a moment without a song id", () => {
    expect(shouldStopForDeletedMoment({}, null, { orIdle: true })).toBe(false);
    expect(shouldStopForDeletedMoment({ songAppleMusicId: null }, song({ appleMusicId: "1" }))).toBe(false);
  });
});

describe("stopSongOfDeletedMoment", () => {
  it("reads the live song and stops it", () => {
    const stop = vi.fn();
    stopSongOfDeletedMoment({ getCurrentSong: () => song({ appleMusicId: "123" }), stop }, { songAppleMusicId: "123" });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("doesn't stop someone else's song", () => {
    const stop = vi.fn();
    stopSongOfDeletedMoment({ getCurrentSong: () => song({ appleMusicId: "9" }), stop }, { songAppleMusicId: "123" });
    expect(stop).not.toHaveBeenCalled();
  });
});

describe("canRemoveFromAlbum", () => {
  it("lets the album owner take out any moment", () => {
    expect(canRemoveFromAlbum("owner", "someone-else", "me")).toBe(true);
    expect(canRemoveFromAlbum("owner", null, "me")).toBe(true); // a guest's
  });

  it("lets a member take out only their own", () => {
    expect(canRemoveFromAlbum("member", "me", "me")).toBe(true);
    expect(canRemoveFromAlbum("member", "someone-else", "me")).toBe(false);
    expect(canRemoveFromAlbum("member", null, "me")).toBe(false);
  });

  it("lets no one without a session", () => {
    expect(canRemoveFromAlbum("owner", "me", null)).toBe(false);
  });
});

describe("cardMenuKeys", () => {
  const journal = { own: true, deletable: true, hostActions: true, album: null };

  it("keeps the Journal's menu exactly", () => {
    expect(cardMenuKeys(journal)).toEqual(["edit", "share", "album", "select", "delete"]);
    expect(cardMenuKeys({ ...journal, hostActions: false })).toEqual(["edit", "delete"]);
    expect(cardMenuKeys({ ...journal, own: false })).toEqual([]);
    expect(cardMenuKeys({ ...journal, deletable: false })).toEqual([]);
  });

  it("gives an owner their own rows in an album, Remove before Delete", () => {
    expect(cardMenuKeys({ ...journal, album: { canRemove: true } })).toEqual([
      "edit",
      "share",
      "album",
      "select",
      "remove",
      "delete",
    ]);
  });

  it("never gives a non-owner Edit, Share, Add to album or Delete", () => {
    const other = { own: false, deletable: true, hostActions: true };
    expect(cardMenuKeys({ ...other, album: { canRemove: true } })).toEqual(["select", "remove"]);
    expect(cardMenuKeys({ ...other, album: { canRemove: false } })).toEqual(["select"]);
  });
});

describe("removeFromAlbumConfirm", () => {
  it("reads like the entry's for one of your own", () => {
    expect(removeFromAlbumConfirm(1, true)).toBe(REMOVE_FROM_ALBUM_CONFIRM);
  });

  it("says where someone else's goes", () => {
    expect(removeFromAlbumConfirm(1, false).message).toBe("It stays in their journal.");
    expect(removeFromAlbumConfirm(3, true)).toMatchObject({
      title: "Remove 3 moments from this album?",
      message: "They stay in your journal.",
      destructive: true,
    });
    expect(removeFromAlbumConfirm(2, false).message).toBe("Each stays in the journal it came from.");
  });
});
