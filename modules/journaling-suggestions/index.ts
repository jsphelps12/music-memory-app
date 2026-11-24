import { requireOptionalNativeModule } from "expo";
import type { RawSuggestion } from "@/lib/yourDay";

// Apple's Journaling Suggestions picker (1.5, "Your day (Apple)"). Null-safe:
// a binary without the module (before 1.5), the simulator or iOS before 17.2
// all report unavailable, and the menu row stays hidden.
// What the picker returns stays on the phone: photos are copies in the app's
// caches, and nothing is saved until the person presses Save in capture.

const native = requireOptionalNativeModule("JournalingSuggestions");

export type PickResult =
  | { status: "picked"; suggestion: RawSuggestion }
  | { status: "cancelled" }
  | { status: "failed" };

/** Whether the picker can run on this phone with this binary. */
export function isYourDayAvailable(): boolean {
  try {
    return !!native?.isAvailable();
  } catch {
    return false;
  }
}

/** Shows Apple's picker. Never throws. */
export async function pickYourDay(): Promise<PickResult> {
  if (!isYourDayAvailable()) return { status: "failed" };
  try {
    const raw = (await native.pick()) as RawSuggestion | null;
    return raw ? { status: "picked", suggestion: raw } : { status: "cancelled" };
  } catch {
    return { status: "failed" };
  }
}

/** Deletes the photo copies picks left behind (sign-out). */
export async function clearYourDayFiles(): Promise<void> {
  if (typeof native?.clearFiles !== "function") return;
  try {
    await native.clearFiles();
  } catch {}
}
