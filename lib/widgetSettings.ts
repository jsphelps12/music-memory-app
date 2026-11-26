/**
 * Memory widget (1.5): the per-user records on this device. No native code
 * here, so tests and lib/signOutKeys.ts can import it.
 *
 * - words: Settings → Privacy → "Show my words on the widget" (off unless "1")
 * - shown: which moment the widget showed on each past day, and the last
 *   file's plan, so lib/widgetPicks.ts can avoid repeats
 * - written: a fingerprint of the file last written, so a cold launch that
 *   would write the same week again skips the write and the widget reload
 *
 * All are named `widget_*_<userId>` and cleared on sign-out by prefix
 * (WIDGET_KEY_PREFIX in lib/signOutKeys.ts).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const WIDGET_KEY_PREFIX = "widget_";

const WRITTEN_KEY_PREFIX = `${WIDGET_KEY_PREFIX}written_v1_`;

export function widgetKeys(userId: string): { words: string; shown: string; written: string } {
  return {
    words: `${WIDGET_KEY_PREFIX}words_v1_${userId}`,
    shown: `${WIDGET_KEY_PREFIX}shown_v1_${userId}`,
    written: `${WRITTEN_KEY_PREFIX}${userId}`,
  };
}

export async function getWidgetWords(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(widgetKeys(userId).words)) === "1";
  } catch {
    return false;
  }
}

export async function setWidgetWords(userId: string, on: boolean): Promise<void> {
  const key = widgetKeys(userId).words;
  if (on) await AsyncStorage.setItem(key, "1");
  else await AsyncStorage.removeItem(key);
}

export interface WidgetShownRecord {
  /** Day → moment id the widget showed (days already past). */
  shown: Record<string, string>;
  /** Day → moment id in the file written last. */
  planned: Record<string, string>;
}

const EMPTY: WidgetShownRecord = { shown: {}, planned: {} };

function isDayMap(v: unknown): v is Record<string, string> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");
}

export async function readWidgetShown(userId: string): Promise<WidgetShownRecord> {
  try {
    const raw = await AsyncStorage.getItem(widgetKeys(userId).shown);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      shown: isDayMap(parsed?.shown) ? parsed.shown : {},
      planned: isDayMap(parsed?.planned) ? parsed.planned : {},
    };
  } catch {
    return EMPTY;
  }
}

export async function writeWidgetShown(userId: string, record: WidgetShownRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(widgetKeys(userId).shown, JSON.stringify(record));
  } catch {}
}

/** The fingerprint of the widget file last written for this user, or null. */
export async function readWidgetWritten(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(widgetKeys(userId).written);
  } catch {
    return null;
  }
}

export async function writeWidgetWritten(userId: string, fingerprint: string): Promise<void> {
  try {
    await AsyncStorage.setItem(widgetKeys(userId).written, fingerprint);
  } catch {}
}

/**
 * Forgets every user's fingerprint: the widget file is gone or about to
 * change, so the next run must write whatever it picks. Never throws.
 */
export async function clearWidgetWritten(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(WRITTEN_KEY_PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } catch {}
}
