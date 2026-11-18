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

export const REMOVE_FROM_ALBUM_CONFIRM: ConfirmOptions = {
  title: "Remove from album?",
  message: "It stays in your journal.",
  confirmLabel: "Remove",
  destructive: true,
};

/** Alert titles that say what failed; friendlyError() supplies the message. */
export const DELETE_MOMENT_FAILED = "Couldn't delete moment";
export const REMOVE_FROM_ALBUM_FAILED = "Couldn't remove from album";

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
