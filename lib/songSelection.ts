import { Song } from "@/types";

let pending: Song | null = null;

export function setPendingSong(song: Song) {
  pending = song;
}

export function consumePendingSong(): Song | null {
  const s = pending;
  pending = null;
  return s;
}
