import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserProfile } from "@/types";

const CACHE_KEY_PREFIX = "profile_cache_v1_";

// Fields the app reads without a fallback. The arrays are spread and filtered
// directly (custom mood edits, MoodSelector, profile diffing), and
// onboardingCompleted drives routing: a cached profile missing it would read
// as "not onboarded" and walk an existing user into onboarding.
const ARRAY_FIELDS = [
  "customMoods",
  "customPromptCategories",
  "favoriteArtists",
  "favoriteSongs",
  "genrePreferences",
] as const;

/**
 * Shape check for the disk cache, like parseCachedTimeline. The cache outlives
 * app updates, so a bundle must not trust what an older one wrote. Returns
 * null (a cache miss) unless the profile has every field the app reads
 * unguarded and, when given, belongs to `userId`.
 */
export function parseCachedProfile(raw: string | null, userId?: string): UserProfile | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.id !== "string") return null;
    if (userId !== undefined && p.id !== userId) return null;
    if (typeof p.onboardingCompleted !== "boolean") return null;
    if (!ARRAY_FIELDS.every((field) => Array.isArray(p[field]))) return null;
    return parsed as UserProfile;
  } catch {
    return null;
  }
}

export async function readProfileCache(userId: string): Promise<UserProfile | null> {
  try {
    return parseCachedProfile(await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`), userId);
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
