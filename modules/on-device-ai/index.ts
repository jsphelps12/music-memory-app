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
