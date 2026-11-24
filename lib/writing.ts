/**
 * Whether there's writing. Text that is exactly a starter or prompt the app
 * put there isn't the user's writing. Pure and dependency-free, so drafts
 * (lib/captureDraft.ts) and transcription (lib/transcription.ts) share it
 * without one loading the other's file handling.
 */
export function hasWriting(reflection: string, templates: readonly string[] = []): boolean {
  const text = reflection.trim();
  if (!text) return false;
  return !templates.some((t) => t.trim() === text);
}
