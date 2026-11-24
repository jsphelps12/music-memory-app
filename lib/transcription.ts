// Voice entries to text (1.5). A recording is transcribed on the phone by
// modules/on-device-ai (Apple's on-device speech recognition, never a server)
// and the words go into the reflection, where the person can edit them. A
// transcript is the person's own words, so it may fill the reflection; it is
// never rewritten or added to by a model.
//
// How the voice sheet uses it (docs/PLAN-1.5.md, Decision 7):
//   const result = await transcribeRecording(uri);
//   if (result.ok) {
//     const next = applyTranscript(reflection, result.text, templates);
//     if (next.action === "fill") replaceReflection(next.text, …);
//     else if (next.action === "offer") // show "Use what you said"
//   }
// Failures are quiet: the recording is kept either way, and "unavailable"
// (a binary before 1.5) or "unsupported" (no on-device recognizer for the
// language) just means no text.
// Pure parts are tested in lib/__tests__/transcription.test.ts.

import { hasWriting } from "@/lib/captureDraft";
import { transcribeFile, type TranscribeFailure } from "@/modules/on-device-ai";

export type TranscriptionResult = { ok: true; text: string } | { ok: false; reason: TranscribeFailure };

export type TranscriptAction =
  /** The reflection is empty or only a starter/prompt: put the words in. */
  | { action: "fill"; text: string }
  /** There's writing already: offer "Use what you said", don't overwrite. */
  | { action: "offer"; text: string }
  /** Nothing to add (no words, or they're already in the reflection). */
  | { action: "none" };

/**
 * Tidy a transcript without changing its words: trim, one space between
 * words, a capital first letter, and a full stop when it trails off without
 * one (a dangling comma or dash becomes the full stop).
 */
export function cleanTranscript(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  if (!out) return "";
  out = out.replace(/^([\p{Pi}\p{Ps}"'¿¡]*)(\p{Ll})/u, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  out = out.replace(/[\s,;:\-–—]+$/u, "");
  if (!out) return "";
  if (/[\p{L}\p{N}]$/u.test(out)) out += ".";
  return out;
}

/**
 * What to do with a transcript, given what's in the reflection. `templates`
 * is the starter and prompt text the app put there (capture's `templates`),
 * which isn't the person's writing: the transcript replaces it.
 */
export function applyTranscript(
  currentReflection: string,
  transcript: string,
  templates: readonly string[] = []
): TranscriptAction {
  const text = cleanTranscript(transcript);
  if (!text) return { action: "none" };
  if (!hasWriting(currentReflection, templates)) return { action: "fill", text };
  const words = text.replace(/[.!?…]+$/u, "");
  if (currentReflection.replace(/\s+/g, " ").includes(words)) return { action: "none" };
  return { action: "offer", text };
}

/**
 * Transcribe a voice entry (a local file uri) on the phone, in the phone's
 * language. Never throws; an empty result is "no_speech". Asks for speech
 * recognition permission the first time.
 */
export async function transcribeRecording(uri: string, localeId?: string | null): Promise<TranscriptionResult> {
  const result = await transcribeFile(uri, localeId);
  if (!result.ok) return result;
  const text = cleanTranscript(result.text);
  return text ? { ok: true, text } : { ok: false, reason: "no_speech" };
}
