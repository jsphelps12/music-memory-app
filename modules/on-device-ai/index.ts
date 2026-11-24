import { requireOptionalNativeModule } from "expo";

// On-device photo understanding (1.4). Everything runs on the phone with
// Apple's models; nothing is uploaded. Null-safe: on a build without the
// native module, callers get null and carry on without it.

export interface PhotoAnalysis {
  /** Photos local identifier (expo-media-library's asset id). */
  id: string;
  /** Scene labels, most confident first: [identifier, confidence 0–1]. */
  labels: [string, number][];
  faces: number;
  /** Share of the frame covered by text, 0–1. */
  textCoverage: number;
  /** iOS 18+: Apple's aesthetics score, -1 (poor) to 1 (great). */
  aesthetic?: number;
  /** iOS 18+: a document, receipt, whiteboard or similar, not a memory. */
  utility?: boolean;
}

const native = requireOptionalNativeModule("OnDeviceAI");

/** Analyse photos by id, at most `maxSide` px. Null without the module. */
export async function analyzePhotos(ids: string[], maxSide = 512): Promise<PhotoAnalysis[] | null> {
  if (!native || ids.length === 0) return native ? [] : null;
  try {
    return (await native.analyzePhotos(ids, maxSide)) as PhotoAnalysis[];
  } catch {
    return null;
  }
}

/** Whether Apple's on-device language model is available (iOS 26+, Apple Intelligence). */
export function canAsk(): boolean {
  try {
    return !!native?.canAsk();
  } catch {
    return false;
  }
}

/**
 * One short question from Apple's on-device model, given plain facts. Null
 * when unavailable or it fails; callers validate and fall back.
 */
export async function askQuestion(facts: string): Promise<string | null> {
  if (!native) return null;
  try {
    return ((await native.askQuestion(facts)) as string | null) ?? null;
  } catch {
    return null;
  }
}

// ── Speech (1.5) ────────────────────────────────────────────────────────────
// Voice entries to text, on the phone only: Apple's SpeechAnalyzer on iOS 26+,
// else SFSpeechRecognizer with on-device recognition required. Never Apple's
// servers: a language the phone can't do locally is "unsupported". Binaries
// before 1.5 have no speech functions and get "unavailable".

export type SpeechPermission = "authorized" | "denied" | "restricted" | "undetermined" | "unavailable";

export type TranscribeFailure = "unavailable" | "denied" | "unsupported" | "no_speech" | "failed";

export interface TranscriptSegment {
  text: string;
  startMs: number;
  durationMs: number;
}

export interface NativeTranscript {
  text: string;
  segments?: TranscriptSegment[];
  /** The locale the recognizer used, e.g. "en-US". */
  locale: string;
}

export type TranscribeResult = ({ ok: true } & NativeTranscript) | { ok: false; reason: TranscribeFailure };

const FAILURE_CODES: readonly TranscribeFailure[] = ["denied", "unsupported", "no_speech", "failed"];
const PERMISSIONS: readonly SpeechPermission[] = ["authorized", "denied", "restricted", "undetermined"];

function hasFunction(name: string): boolean {
  return typeof native?.[name] === "function";
}

function asPermission(value: unknown): SpeechPermission {
  return PERMISSIONS.includes(value as SpeechPermission) ? (value as SpeechPermission) : "denied";
}

/** Whether this binary can transcribe at all (1.5+). */
export function canTranscribe(): boolean {
  return hasFunction("transcribeFile");
}

/** Speech recognition permission, without asking. */
export function speechAuthorizationStatus(): SpeechPermission {
  if (!hasFunction("speechAuthorizationStatus")) return "unavailable";
  try {
    return asPermission(native.speechAuthorizationStatus());
  } catch {
    return "unavailable";
  }
}

/** Ask for speech recognition permission (shows the system prompt once). */
export async function requestSpeechAuthorization(): Promise<SpeechPermission> {
  if (!hasFunction("requestSpeechAuthorization")) return "unavailable";
  try {
    return asPermission(await native.requestSpeechAuthorization());
  } catch {
    return "unavailable";
  }
}

/**
 * Transcribe a recording (a local file uri, at most 3 minutes) on the phone.
 * `localeId` defaults to the phone's language. Never throws.
 */
export async function transcribeFile(uri: string, localeId?: string | null): Promise<TranscribeResult> {
  if (!canTranscribe()) return { ok: false, reason: "unavailable" };
  try {
    const result = (await native.transcribeFile(uri, localeId ?? null)) as NativeTranscript;
    return { ok: true, text: result.text ?? "", segments: result.segments, locale: result.locale };
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    const reason = FAILURE_CODES.includes(code as TranscribeFailure) ? (code as TranscribeFailure) : "failed";
    return { ok: false, reason };
  }
}
