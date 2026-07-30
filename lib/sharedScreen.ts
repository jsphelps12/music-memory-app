import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchSharedAlbumActivity,
  fetchPendingAlbumInvites,
  AlbumInvite,
} from "@/lib/albums";
import { fetchPendingRequests, fetchFriends } from "@/lib/friends";

export type SharedScreenData = Awaited<ReturnType<typeof fetchSharedScreenData>>;

// Versioned, like timeline_cache_v1_ / profile_cache_v1_. Whatever reads this
// JSON.parses it straight into SharedScreenData and hands it to a screen, so a
// shape change would serve stale-shaped objects with nothing to notice. Bump the
// suffix whenever fetchSharedScreenData's return shape changes, and add the old
// prefix to SHARED_CACHE_PREFIXES_TO_CLEAR below.
//
// Nothing writes this cache at the moment: its only writer was the launch
// prefetch in AuthContext, removed because the screen it warmed
// (app/shared-albums.tsx) is unreachable. read/writeSharedCache are kept for
// whatever revives that screen; the clear path still runs so existing installs
// shed the key they already have.
const SHARED_CACHE_PREFIX = "shared_screen_v1_";

// Every prefix this module has ever written, cleared together on sign-out and
// account deletion — bumping a version orphans the old key otherwise, leaving a
// full copy of the user's friends and shared albums on disk forever.
const SHARED_CACHE_PREFIXES_TO_CLEAR = [SHARED_CACHE_PREFIX, "shared_screen_"];

const sharedCacheKey = (userId: string) => `${SHARED_CACHE_PREFIX}${userId}`;

// Cheap structural check, not validation: the version prefix protects against
// shapes we know changed, this catches a truncated or hand-edited payload. On
// mismatch we return null so the caller falls through to the network. Typed as
// keyof SharedScreenData so renaming or dropping a field fails the build here.
const SHARED_SCREEN_KEYS: (keyof SharedScreenData)[] = [
  "pendingRequests",
  "hasFriends",
  "sharedAlbums",
  "albumInvites",
];

function isSharedScreenData(value: unknown): value is SharedScreenData {
  if (typeof value !== "object" || value === null) return false;
  return SHARED_SCREEN_KEYS.every((key) => key in value);
}

export async function readSharedCache(userId: string): Promise<SharedScreenData | null> {
  try {
    const raw = await AsyncStorage.getItem(sharedCacheKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSharedScreenData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeSharedCache(userId: string, data: SharedScreenData): Promise<void> {
  try {
    await AsyncStorage.setItem(sharedCacheKey(userId), JSON.stringify(data));
  } catch {}
}

export async function clearSharedCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove(SHARED_CACHE_PREFIXES_TO_CLEAR.map((p) => `${p}${userId}`));
  } catch {}
}

export async function fetchSharedScreenData(userId: string) {
  const [requests, friends, albums, invites] = await Promise.all([
    fetchPendingRequests(userId),
    fetchFriends(userId),
    fetchSharedAlbumActivity(userId),
    fetchPendingAlbumInvites(userId).catch(() => [] as AlbumInvite[]),
  ]);
  return {
    pendingRequests: requests,
    hasFriends: friends.length > 0,
    sharedAlbums: albums,
    albumInvites: invites,
  };
}
