import type { ConfirmOptions } from "@/components/ConfirmSheet";
import { playbackSongId } from "@/lib/playbackStore";
import type { Song } from "@/types";

// One copy of the moment actions' words, shared by the entry's "…" menu and
// the card's long-press menu, so the two can't drift apart again.

export const DELETE_MOMENT_CONFIRM: ConfirmOptions = {
  title: "Delete this moment?",
  message: "Its photos are deleted too. This can't be undone.",
  confirmLabel: "Delete",
  destructive: true,
};

/** Select mode's Delete: one moment reads exactly like the single delete. */
export function deleteMomentsConfirm(count: number): ConfirmOptions {
  if (count === 1) return DELETE_MOMENT_CONFIRM;
  return {
    title: `Delete ${count} moments?`,
    message: "Their photos are deleted too. This can't be undone.",
    confirmLabel: "Delete",
    destructive: true,
  };
}

export const REMOVE_FROM_ALBUM_CONFIRM: ConfirmOptions = {
  title: "Remove from album?",
  message: "It stays in your journal.",
  confirmLabel: "Remove",
  destructive: true,
};

/** Alert titles that say what failed; friendlyError() supplies the message. */
export const DELETE_MOMENT_FAILED = "Couldn't delete moment";
export const REMOVE_FROM_ALBUM_FAILED = "Couldn't remove from album";
export const ADD_TO_ALBUM_FAILED = "Couldn't add to album";

interface SongIds {
  songSpotifyId?: string | null;
  songAppleMusicId?: string | null;
}

/**
 * Whether deleting this moment should stop the player: its song is the one
 * loaded (playing or paused in the mini player). With `orIdle`, also when
 * nothing is loaded yet: the entry screen autoplays its moment's song, and a
 * start still waiting on Apple Music shows no current song until it lands;
 * stopping cancels it, so the deleted moment's song doesn't begin afterwards.
 */
export function shouldStopForDeletedMoment(
  moment: SongIds,
  current: Song | null,
  { orIdle = false }: { orIdle?: boolean } = {}
): boolean {
  const songId = playbackSongId({ spotifyId: moment.songSpotifyId, appleMusicId: moment.songAppleMusicId });
  if (!songId) return false;
  if (!current) return orIdle;
  return playbackSongId(current) === songId;
}

/** Stops the player if it holds the deleted moment's song (see above). Reads the live song. */
export function stopSongOfDeletedMoment(
  player: { getCurrentSong: () => Song | null; stop: () => Promise<void> | void },
  moment: SongIds,
  options?: { orIdle?: boolean }
): void {
  if (shouldStopForDeletedMoment(moment, player.getCurrentSong(), options)) {
    void player.stop();
  }
}

/**
 * Remove from album, from the album screen. One of your own moments reads
 * exactly like the entry's Remove from album; someone else's (the album
 * owner tidying a shared album) says where it goes instead of "your journal".
 */
export function removeFromAlbumConfirm(count: number, allOwn: boolean): ConfirmOptions {
  if (count === 1) {
    return allOwn ? REMOVE_FROM_ALBUM_CONFIRM : { ...REMOVE_FROM_ALBUM_CONFIRM, message: "It stays in their journal." };
  }
  return {
    title: `Remove ${count} moments from this album?`,
    message: allOwn ? "They stay in your journal." : "Each stays in the journal it came from.",
    confirmLabel: "Remove",
    destructive: true,
  };
}

/**
 * Who can take a moment out of an album: the album's owner (any moment, a
 * guest's included), or the moment's owner. That is the "member who added
 * it" of the delete policy on collection_moments: a member can only ever add
 * their own moments (the insert policy requires owns_moment), so the adder
 * and the owner are the same person. The same rule as the entry's "…" menu.
 */
export function canRemoveFromAlbum(
  albumRole: string | null | undefined,
  momentUserId: string | null | undefined,
  viewerId: string | null | undefined
): boolean {
  if (!viewerId) return false;
  return albumRole === "owner" || (!!momentUserId && momentUserId === viewerId);
}

/** A long-pressed card's rows, by key. */
export type CardMenuKey = "edit" | "share" | "album" | "select" | "remove" | "delete";

export interface CardMenuOptions {
  /** The viewer owns the moment. */
  own: boolean;
  /** The host drops a deleted moment from its list (MomentCard's onDeleted). */
  deletable: boolean;
  /** The host takes Share, Add to album, Select and Remove (onMenuAction). */
  hostActions: boolean;
  /** Inside an album: whether this viewer may take this moment out. Null elsewhere. */
  album: { canRemove: boolean } | null;
}

/**
 * Which rows a card's long-press menu offers, in menu order: Edit, Share,
 * Add to album, Select, then the destructive ones last (DESIGN.md, Menus).
 * Outside an album (the Journal) only the owner's own moments get a menu, as
 * before. Inside one, anyone in the album can Select; Remove follows
 * canRemoveFromAlbum; Edit, Share, Add to album and Delete stay the owner's
 * (only the owner can pass a moment on: canPassOn, lib/momentView.ts).
 */
export function cardMenuKeys({ own, deletable, hostActions, album }: CardMenuOptions): CardMenuKey[] {
  if (!album || !hostActions) {
    if (!own || !deletable) return [];
    return hostActions ? ["edit", "share", "album", "select", "delete"] : ["edit", "delete"];
  }
  const keys: CardMenuKey[] = own ? ["edit", "share", "album", "select"] : ["select"];
  if (album.canRemove) keys.push("remove");
  if (own && deletable) keys.push("delete");
  return keys;
}
