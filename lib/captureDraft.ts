import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Song } from "@/types";

/**
 * The capture screen's unsaved entry, so long writing survives Cancel, a
 * crash or iOS killing the app. One draft per user; cleared on save or
 * "Start fresh". Older than a week and it's no longer "where you left off".
 */
export interface CaptureDraft {
  reflection: string;
  song: Song | null;
  savedAt: number;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const key = (userId: string) => `captureDraft:${userId}`;

export async function loadCaptureDraft(userId: string): Promise<CaptureDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as CaptureDraft;
    if (Date.now() - draft.savedAt > MAX_AGE_MS || !isWorthKeeping(draft)) {
      await AsyncStorage.removeItem(key(userId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export async function saveCaptureDraft(userId: string, draft: Omit<CaptureDraft, "savedAt">): Promise<void> {
  try {
    if (!isWorthKeeping(draft)) {
      await AsyncStorage.removeItem(key(userId));
      return;
    }
    await AsyncStorage.setItem(key(userId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {}
}

export async function clearCaptureDraft(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {}
}

/** Only writing is worth restoring; a song alone is two taps to redo. */
export function isWorthKeeping(draft: Pick<CaptureDraft, "reflection">): boolean {
  return draft.reflection.trim().length > 0;
}
