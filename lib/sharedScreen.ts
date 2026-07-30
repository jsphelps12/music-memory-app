import AsyncStorage from "@react-native-async-storage/async-storage";

// This module is a cleanup path only. It used to back app/shared-albums.tsx —
// an unreachable screen deleted along with its fetch and read/write cache
// helpers. What survives is the clear path: installs from before that deletion
// still have `shared_screen_v1_{userId}` on disk holding a full copy of the
// user's friends and shared albums, and sign-out is the only thing that sheds
// it. Removing this would strand that data on every existing device forever.
//
// Safe to delete outright once no install predating the deletion remains.

// Every prefix this module has ever written, cleared together on sign-out and
// account deletion — bumping a version orphans the old key otherwise, leaving a
// full copy of the user's friends and shared albums on disk forever.
const SHARED_CACHE_PREFIXES_TO_CLEAR = ["shared_screen_v1_", "shared_screen_"];

export async function clearSharedCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove(SHARED_CACHE_PREFIXES_TO_CLEAR.map((p) => `${p}${userId}`));
  } catch {}
}
