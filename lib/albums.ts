import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { Album, AlbumPreview, Moment } from "@/types";

const ALBUMS_CACHE_PREFIX = "collections_cache_v1_";

function albumsCacheKey(userId: string) {
  return `${ALBUMS_CACHE_PREFIX}${userId}`;
}

export async function readAlbumsCache(userId: string): Promise<Album[] | null> {
  try {
    const raw = await AsyncStorage.getItem(albumsCacheKey(userId));
    return raw ? (JSON.parse(raw) as Album[]) : null;
  } catch {
    return null;
  }
}

export async function writeAlbumsCache(userId: string, albums: Album[]): Promise<void> {
  try {
    await AsyncStorage.setItem(albumsCacheKey(userId), JSON.stringify(albums));
  } catch {}
}

export async function clearAlbumsCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(albumsCacheKey(userId));
  } catch {}
}

// ─── Album moments cache ──────────────────────────────────────────────────────
// Persists across app restarts so the first tap on an album is instant.
// All albums for a user stored under one key to keep clear/enumerate simple.

const ALBUM_MOMENTS_CACHE_KEY_PREFIX = "collection_moments_v1_";
const ALBUM_MOMENTS_TTL_MS = 5 * 60 * 1000; // 5 minutes

function albumMomentsCacheKey(userId: string) {
  return `${ALBUM_MOMENTS_CACHE_KEY_PREFIX}${userId}`;
}

export async function clearAllAlbumMomentsCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(albumMomentsCacheKey(userId));
  } catch {}
}

export { ALBUM_MOMENTS_TTL_MS };

export interface AlbumMember {
  userId: string;
  displayName: string | null;
  joinedAt: string;
}

export async function fetchAlbums(userId: string): Promise<Album[]> {
  // Owned albums and member rows don't depend on each other — run in parallel
  const [
    { data: owned, error: ownedError },
    { data: memberRows, error: memberError },
  ] = await Promise.all([
    supabase
      .from("collections")
      .select("id, user_id, name, created_at, is_public, invite_code, cover_photo_url, collection_moments(moment_id)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("collection_members")
      .select("collection_id, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true }),
  ]);

  if (ownedError) throw ownedError;
  if (memberError) throw memberError;

  const joinedIds = (memberRows ?? []).map((r: any) => r.collection_id);

  let joinedAlbums: Album[] = [];

  if (joinedIds.length > 0) {
    const { data: joined, error: joinedError } = await supabase
      .from("collections")
      .select("id, user_id, name, created_at, is_public, invite_code, cover_photo_url, collection_moments(moment_id)")
      .in("id", joinedIds)
      .order("created_at", { ascending: true });

    if (joinedError) throw joinedError;

    // Fetch owner display names for joined albums
    const ownerIds = [...new Set((joined ?? []).map((c: any) => c.user_id))];
    const { data: profiles } = ownerIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", ownerIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    joinedAlbums = (joined ?? []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      createdAt: row.created_at,
      momentCount: (row.collection_moments ?? []).length,
      isPublic: row.is_public ?? false,
      inviteCode: row.invite_code ?? undefined,
      role: "member" as const,
      ownerName: profileMap.get(row.user_id) ?? undefined,
      coverPhotoUrl: row.cover_photo_url ?? undefined,
    }));
  }

  const ownedAlbums: Album[] = (owned ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    momentCount: (row.collection_moments ?? []).length,
    momentIds: (row.collection_moments ?? []).map((cm: any) => cm.moment_id),
    isPublic: row.is_public ?? false,
    inviteCode: row.invite_code ?? undefined,
    role: "owner" as const,
    coverPhotoUrl: row.cover_photo_url ?? undefined,
  }));

  return [...ownedAlbums, ...joinedAlbums];
}

export async function createAlbum(userId: string, name: string, isShared = false): Promise<Album> {
  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: userId, name, is_public: isShared })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    createdAt: data.created_at,
    momentCount: 0,
    isPublic: data.is_public ?? false,
    inviteCode: data.invite_code ?? undefined,
    role: "owner",
  };
}

export async function convertAlbumToShared(id: string): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ is_public: true })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}

export async function addMomentToAlbum(
  collectionId: string,
  momentId: string,
  addedByUserId: string
): Promise<void> {
  const { error } = await supabase
    .from("collection_moments")
    .insert({ collection_id: collectionId, moment_id: momentId, added_by_user_id: addedByUserId });
  if (error) throw error;
}

export async function removeMomentFromAlbum(collectionId: string, momentId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_moments")
    .delete()
    .eq("collection_id", collectionId)
    .eq("moment_id", momentId);
  if (error) throw error;
}

// Returns a lightweight preview of a public album for the join screen
export async function fetchAlbumByInviteCode(inviteCode: string): Promise<AlbumPreview | null> {
  const { data: album, error } = await supabase
    .from("collections")
    .select("id, user_id, name, is_public, invite_code, collection_moments(moment_id)")
    .eq("invite_code", inviteCode)
    .eq("is_public", true)
    .single();

  if (error || !album) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", album.user_id)
    .single();

  return {
    id: album.id,
    name: album.name,
    ownerId: album.user_id,
    ownerName: profile?.display_name ?? null,
    momentCount: (album.collection_moments ?? []).length,
    isPublic: album.is_public,
    inviteCode: album.invite_code,
  };
}

// Insert the current user into collection_members and return the joined Album
export async function joinAlbum(inviteCode: string, userId: string): Promise<Album> {
  // Look up the album
  const preview = await fetchAlbumByInviteCode(inviteCode);
  if (!preview) throw new Error("Album not found or is no longer public.");

  const { error } = await supabase
    .from("collection_members")
    .insert({ collection_id: preview.id, user_id: userId });

  if (error) throw error;

  return {
    id: preview.id,
    userId: userId,
    name: preview.name,
    createdAt: new Date().toISOString(),
    momentCount: preview.momentCount,
    isPublic: preview.isPublic,
    inviteCode: preview.inviteCode,
    role: "member",
    ownerName: preview.ownerName ?? undefined,
  };
}

// Remove the current user from a shared album
export async function leaveAlbum(collectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .delete()
    .eq("collection_id", collectionId)
    .eq("user_id", userId);
  if (error) throw error;
}

// Fetch all members of an album (owner use only)
export async function fetchAlbumMembers(collectionId: string): Promise<AlbumMember[]> {
  const { data, error } = await supabase
    .from("collection_members")
    .select("user_id, joined_at")
    .eq("collection_id", collectionId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const userIds = data.map((r: any) => r.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

  return data.map((r: any) => ({
    userId: r.user_id,
    displayName: profileMap.get(r.user_id) ?? null,
    joinedAt: r.joined_at,
  }));
}

// Remove a specific member from an album (owner use only)
export async function removeAlbumMember(collectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .delete()
    .eq("collection_id", collectionId)
    .eq("user_id", userId);
  if (error) throw error;
}

export interface SharedAlbumActivity {
  collectionId: string;
  name: string;
  role: 'owner' | 'member';
  ownerName?: string;
  inviteCode?: string;
  totalMoments: number;
  newMomentCount: number;
  latestAddedAt: string | null;
  coverPhotoUrl?: string;
}

// Fetch all shared albums the user is in, with new-moment counts since last visit.
// "New" = added_at > last_viewed_at (members) or > owner_last_viewed_at (owners).
// Falls back to joined_at / created_at when never viewed.
export async function fetchSharedAlbumActivity(userId: string): Promise<SharedAlbumActivity[]> {
  // Owned shared collections
  const { data: ownedRows, error: ownedError } = await supabase
    .from("collections")
    .select("id, name, invite_code, cover_photo_url, created_at, owner_last_viewed_at, collection_moments(moment_id, added_at)")
    .eq("user_id", userId)
    .eq("is_public", true);

  if (ownedError) throw ownedError;

  // Joined shared collections
  const { data: memberRows, error: memberError } = await supabase
    .from("collection_members")
    .select("collection_id, joined_at, last_viewed_at")
    .eq("user_id", userId);

  if (memberError) throw memberError;

  const joinedIds = (memberRows ?? []).map((r: any) => r.collection_id);
  let joinedActivity: SharedAlbumActivity[] = [];

  if (joinedIds.length > 0) {
    const { data: joinedRows, error: joinedError } = await supabase
      .from("collections")
      .select("id, name, user_id, invite_code, cover_photo_url, collection_moments(moment_id, added_at)")
      .in("id", joinedIds);

    if (joinedError) throw joinedError;

    const ownerIds = [...new Set((joinedRows ?? []).map((c: any) => c.user_id))];
    const { data: profiles } = ownerIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", ownerIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
    const memberMap = new Map((memberRows ?? []).map((r: any) => [r.collection_id, r]));

    joinedActivity = (joinedRows ?? []).map((row: any) => {
      const membership = memberMap.get(row.id);
      const lastViewed: string | null = membership?.last_viewed_at ?? membership?.joined_at ?? null;
      const moments: any[] = row.collection_moments ?? [];
      const newCount = lastViewed
        ? moments.filter((m: any) => m.added_at > lastViewed).length
        : moments.length;
      const latest = moments.reduce((max: string | null, m: any) =>
        !max || m.added_at > max ? m.added_at : max, null);
      return {
        collectionId: row.id,
        name: row.name,
        role: 'member' as const,
        ownerName: profileMap.get(row.user_id) ?? undefined,
        inviteCode: row.invite_code ?? undefined,
        totalMoments: moments.length,
        newMomentCount: newCount,
        latestAddedAt: latest,
        coverPhotoUrl: row.cover_photo_url ?? undefined,
      };
    });
  }

  const ownedActivity: SharedAlbumActivity[] = (ownedRows ?? []).map((row: any) => {
    const lastViewed: string | null = row.owner_last_viewed_at ?? row.created_at ?? null;
    const moments: any[] = row.collection_moments ?? [];
    const newCount = lastViewed
      ? moments.filter((m: any) => m.added_at > lastViewed).length
      : moments.length;
    const latest = moments.reduce((max: string | null, m: any) =>
      !max || m.added_at > max ? m.added_at : max, null);
    return {
      collectionId: row.id,
      name: row.name,
      role: 'owner' as const,
      inviteCode: row.invite_code ?? undefined,
      totalMoments: moments.length,
      newMomentCount: newCount,
      latestAddedAt: latest,
      coverPhotoUrl: row.cover_photo_url ?? undefined,
    };
  });

  // Deduplicate by collectionId — owner entry wins if the same id appears in both lists
  const seen = new Set<string>();
  return [...ownedActivity, ...joinedActivity]
    .filter((c) => {
      if (seen.has(c.collectionId)) return false;
      seen.add(c.collectionId);
      return c.role === 'owner' || c.totalMoments > 0;
    })
    .sort((a, b) => {
      if (!a.latestAddedAt) return 1;
      if (!b.latestAddedAt) return -1;
      return b.latestAddedAt.localeCompare(a.latestAddedAt);
    });
}

// Mark a shared album as viewed now — clears its new-moment badge.
export async function markAlbumViewed(
  collectionId: string,
  userId: string,
  role: 'owner' | 'member'
): Promise<void> {
  const now = new Date().toISOString();
  if (role === 'owner') {
    const { error } = await supabase
      .from("collections")
      .update({ owner_last_viewed_at: now })
      .eq("id", collectionId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("collection_members")
      .update({ last_viewed_at: now })
      .eq("collection_id", collectionId)
      .eq("user_id", userId);
    if (error) throw error;
  }
}

// Fetch all moments across all contributors in a shared album via a single
// server-side join (get_shared_collection_moments RPC), avoiding 3 serial queries.
export async function fetchSharedAlbumMoments(collectionId: string): Promise<Moment[]> {
  const { data, error } = await supabase.rpc("get_shared_collection_moments", {
    p_collection_id: collectionId,
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const moment = mapRowToMoment(row);
    moment.contributorName = row.contributor_name ?? null;
    return moment;
  });
}

export async function updateAlbumCover(collectionId: string, path: string | null): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ cover_photo_url: path })
    .eq("id", collectionId);
  if (error) throw error;
}

export async function renameAlbum(collectionId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ name })
    .eq("id", collectionId);
  if (error) throw error;
}

async function addAlbumMemberById(collectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .insert({ collection_id: collectionId, user_id: userId });
  // Ignore duplicate membership (already a member)
  if (error && error.code !== "23505") throw error;
}

export async function searchUsersForAlbum(
  query: string,
  excludeIds: string[]
): Promise<{ id: string; displayName: string; username: string }[]> {
  if (query.trim().length < 2) return [];
  let q = supabase
    .from("profiles")
    .select("id, display_name, username")
    .ilike("username", `%${query.trim()}%`)
    .limit(10);
  if (excludeIds.length > 0) {
    q = q.not("id", "in", `(${excludeIds.join(",")})`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    displayName: r.display_name ?? r.username ?? "Unknown",
    username: r.username ?? "",
  }));
}

// ── Album invites ─────────────────────────────────────────────────────────────

export interface AlbumInvite {
  id: string;
  collectionId: string;
  collectionName: string;
  inviterName: string | null;
  createdAt: string;
}

export interface SentAlbumInvite {
  id: string;
  inviteeId: string;
  inviteeName: string | null;
  createdAt: string;
}

/** Owner sends an invite to a specific user. Silently ignores duplicate. */
export async function sendAlbumInvite(
  collectionId: string,
  inviterId: string,
  inviteeId: string
): Promise<void> {
  const { error } = await supabase
    .from("collection_invites")
    .insert({ collection_id: collectionId, inviter_id: inviterId, invitee_id: inviteeId });
  if (error && error.code !== "23505") throw error;
}

/** Fetch pending invites the current user has received. */
export async function fetchPendingAlbumInvites(userId: string): Promise<AlbumInvite[]> {
  const { data, error } = await supabase
    .from("collection_invites")
    .select("id, collection_id, inviter_id, created_at, collections(name)")
    .eq("invitee_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const inviterIds = [...new Set(data.map((r: any) => r.inviter_id).filter(Boolean))];
  const { data: profiles } = inviterIds.length > 0
    ? await supabase.from("profiles").select("id, display_name").in("id", inviterIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

  return data.map((r: any) => ({
    id: r.id,
    collectionId: r.collection_id,
    collectionName: (r.collections as any)?.name ?? "Unknown",
    inviterName: profileMap.get(r.inviter_id) ?? null,
    createdAt: r.created_at,
  }));
}

/** Fetch invites the owner has sent for an album (pending, not yet accepted). */
export async function fetchSentAlbumInvites(collectionId: string): Promise<SentAlbumInvite[]> {
  const { data, error } = await supabase
    .from("collection_invites")
    .select("id, invitee_id, created_at")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const inviteeIds = [...new Set(data.map((r: any) => r.invitee_id).filter(Boolean))];
  const { data: profiles } = inviteeIds.length > 0
    ? await supabase.from("profiles").select("id, display_name").in("id", inviteeIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

  return data.map((r: any) => ({
    id: r.id,
    inviteeId: r.invitee_id,
    inviteeName: profileMap.get(r.invitee_id) ?? null,
    createdAt: r.created_at,
  }));
}

/** Accept an invite: join the album then delete the invite row. */
export async function acceptAlbumInvite(
  inviteId: string,
  collectionId: string,
  userId: string
): Promise<void> {
  await addAlbumMemberById(collectionId, userId);
  const { error } = await supabase
    .from("collection_invites")
    .delete()
    .eq("id", inviteId);
  if (error) throw error;
}

/** Decline or revoke an invite (works for both invitee and owner). */
export async function deleteAlbumInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_invites")
    .delete()
    .eq("id", inviteId);
  if (error) throw error;
}
