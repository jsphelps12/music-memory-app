/**
 * What the play button on a moment should do, given what the player holds.
 * A song that's loaded but paused (e.g. the app went to the background) is
 * still this moment's song: the button resumes it and the progress bar stays,
 * instead of restarting from 0:00. Pure; tested in lib/__tests__/playerAction.test.ts.
 */
export type PlayAction = "pause" | "resume" | "play";

export function playAction(
  momentSongId: string | null | undefined,
  loadedSongId: string | null | undefined,
  isPlaying: boolean
): PlayAction {
  const isLoaded = !!momentSongId && momentSongId === loadedSongId;
  if (!isLoaded) return "play";
  return isPlaying ? "pause" : "resume";
}
