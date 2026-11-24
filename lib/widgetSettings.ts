/**
 * Memory widget (1.5): the per-user records on this device. No native code
 * here, so tests and lib/signOutKeys.ts can import it.
 *
 * - words: Settings → Privacy → "Show my words on the widget" (off unless "1")
 * - shown: which moment the widget showed on each past day, and the last
 *   file's plan, so lib/widgetPicks.ts can avoid repeats
 *
 * Both are named `widget_*_<userId>` and cleared on sign-out by prefix
 * (WIDGET_KEY_PREFIX in lib/signOutKeys.ts).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const WIDGET_KEY_PREFIX = "widget_";

export function widgetKeys(userId: string): { words: string; shown: string } {
  return {
    words: `${WIDGET_KEY_PREFIX}words_v1_${userId}`,
    shown: `${WIDGET_KEY_PREFIX}shown_v1_${userId}`,
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
