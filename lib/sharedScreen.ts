import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchSharedAlbumActivity,
  fetchPendingAlbumInvites,
  AlbumInvite,
} from "@/lib/albums";
import { fetchPendingRequests, fetchFriends } from "@/lib/friends";

export type SharedScreenData = Awaited<ReturnType<typeof fetchSharedScreenData>>;

const sharedCacheKey = (userId: string) => `shared_screen_${userId}`;

export async function readSharedCache(userId: string): Promise<SharedScreenData | null> {
  try {
    const raw = await AsyncStorage.getItem(sharedCacheKey(userId));
    return raw ? (JSON.parse(raw) as SharedScreenData) : null;
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
    await AsyncStorage.removeItem(sharedCacheKey(userId));
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
