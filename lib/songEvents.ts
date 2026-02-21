import { Song } from "@/types";

type Listener = (song: Song) => void;
let _listener: Listener | null = null;

export function onSongSelected(fn: Listener): () => void {
  _listener = fn;
  return () => {
    if (_listener === fn) _listener = null;
  };
}

export function emitSongSelected(song: Song) {
  _listener?.(song);
}
