import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserProfile } from "@/types";

const CACHE_KEY_PREFIX = "profile_cache_v1_";

export async function readProfileCache(userId: string): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function writeProfileCache(userId: string, profile: UserProfile): void {
  AsyncStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(profile)).catch(() => {});
}

export async function clearProfileCache(userId: string): Promise<void> {
  try { await AsyncStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`); } catch {}
}
