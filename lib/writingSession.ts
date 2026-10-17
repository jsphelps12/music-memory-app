/**
 * Hand-off between a screen with a writing area (capture, edit) and the
 * full-page writer at app/write.tsx. Same consume-once shape as
 * lib/momentCache.ts: the opener sets a session, the writer consumes it on
 * mount and calls `onDone` with the finished text before going back.
 */
export interface WritingSession {
  text: string;
  /** Shown small at the top of the page so you know what you're writing about. */
  songTitle?: string;
  songArtist?: string;
  songArtworkUrl?: string;
  placeholder?: string;
  onDone: (text: string) => void;
}

let pending: WritingSession | null = null;

export function setWritingSession(session: WritingSession) {
  pending = session;
}

export function consumeWritingSession(): WritingSession | null {
  const snap = pending;
  pending = null;
  return snap;
}
