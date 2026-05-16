import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { Collection, CollectionPreview, Moment } from "@/types";

export interface CollectionMember {
  userId: string;
  displayName: string | null;
  joinedAt: string;
}

export async function fetchCollections(userId: string): Promise<Collection[]> {
  // Owned collections
  const { data: owned, error: ownedError } = await supabase
    .from("collections")
    .select("id, user_id, name, created_at, is_public, invite_code, collection_moments(moment_id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (ownedError) throw ownedError;

  // IDs of collections this user has joined (but doesn't own)
  const { data: memberRows, error: memberError } = await supabase
    .from("collection_members")
    .select("collection_id, joined_at")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });

  if (memberError) throw memberError;

  const joinedIds = (memberRows ?? []).map((r: any) => r.collection_id);

  let joinedCollections: Collection[] = [];

  if (joinedIds.length > 0) {
    const { data: joined, error: joinedError } = await supabase
      .from("collections")
      .select("id, user_id, name, created_at, is_public, invite_code, collection_moments(moment_id)")
      .in("id", joinedIds)
      .order("created_at", { ascending: true });

    if (joinedError) throw joinedError;

    // Fetch owner display names for joined collections
    const ownerIds = [...new Set((joined ?? []).map((c: any) => c.user_id))];
    const { data: profiles } = ownerIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", ownerIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    joinedCollections = (joined ?? []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      createdAt: row.created_at,
      momentCount: (row.collection_moments ?? []).length,
      isPublic: row.is_public ?? false,
      inviteCode: row.invite_code ?? undefined,
      role: "member" as const,
      ownerName: profileMap.get(row.user_id) ?? undefined,
    }));
  }

  const ownedCollections: Collection[] = (owned ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    momentCount: (row.collection_moments ?? []).length,
    isPublic: row.is_public ?? false,
    inviteCode: row.invite_code ?? undefined,
    role: "owner" as const,
  }));

  return [...ownedCollections, ...joinedCollections];
}

export async function createCollection(userId: string, name: string, isShared = false): Promise<Collection> {
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

export async function convertCollectionToShared(id: string): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ is_public: true })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}

export async function addMomentToCollection(
  collectionId: string,
  momentId: string,
  addedByUserId: string
): Promise<void> {
  const { error } = await supabase
    .from("collection_moments")
    .insert({ collection_id: collectionId, moment_id: momentId, added_by_user_id: addedByUserId });
  if (error) throw error;
}

export async function removeMomentFromCollection(collectionId: string, momentId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_moments")
    .delete()
    .eq("collection_id", collectionId)
    .eq("moment_id", momentId);
  if (error) throw error;
}

export async function fetchMomentCollectionIds(momentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("collection_moments")
    .select("collection_id")
    .eq("moment_id", momentId);

  if (error) throw error;
  return (data ?? []).map((row: any) => row.collection_id);
}

// Returns a lightweight preview of a public collection for the join screen
export async function fetchCollectionByInviteCode(inviteCode: string): Promise<CollectionPreview | null> {
  const { data: collection, error } = await supabase
    .from("collections")
    .select("id, user_id, name, is_public, invite_code, collection_moments(moment_id)")
    .eq("invite_code", inviteCode)
    .eq("is_public", true)
    .single();

  if (error || !collection) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", collection.user_id)
    .single();

  return {
    id: collection.id,
    name: collection.name,
    ownerId: collection.user_id,
    ownerName: profile?.display_name ?? null,
    momentCount: (collection.collection_moments ?? []).length,
    isPublic: collection.is_public,
    inviteCode: collection.invite_code,
  };
}

// Insert the current user into collection_members and return the joined Collection
export async function joinCollection(inviteCode: string, userId: string): Promise<Collection> {
  // Look up the collection
  const preview = await fetchCollectionByInviteCode(inviteCode);
  if (!preview) throw new Error("Collection not found or is no longer public.");

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

// Remove the current user from a shared collection
export async function leaveCollection(collectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .delete()
    .eq("collection_id", collectionId)
    .eq("user_id", userId);
  if (error) throw error;
}

// Fetch all members of a collection (owner use only)
export async function fetchCollectionMembers(collectionId: string): Promise<CollectionMember[]> {
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

// Remove a specific member from a collection (owner use only)
export async function removeCollectionMember(collectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .delete()
    .eq("collection_id", collectionId)
    .eq("user_id", userId);
  if (error) throw error;
}

export interface SharedCollectionActivity {
  collectionId: string;
  name: string;
  role: 'owner' | 'member';
  ownerName?: string;
  inviteCode?: string;
  totalMoments: number;
  newMomentCount: number;
  latestAddedAt: string | null;
}

// Fetch all shared collections the user is in, with new-moment counts since last visit.
// "New" = added_at > last_viewed_at (members) or > owner_last_viewed_at (owners).
// Falls back to joined_at / created_at when never viewed.
export async function fetchSharedCollectionActivity(userId: string): Promise<SharedCollectionActivity[]> {
  // Owned shared collections
  const { data: ownedRows, error: ownedError } = await supabase
    .from("collections")
    .select("id, name, invite_code, created_at, owner_last_viewed_at, collection_moments(moment_id, added_at)")
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
  let joinedActivity: SharedCollectionActivity[] = [];

  if (joinedIds.length > 0) {
    const { data: joinedRows, error: joinedError } = await supabase
      .from("collections")
      .select("id, name, user_id, invite_code, collection_moments(moment_id, added_at)")
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
      };
    });
  }

  const ownedActivity: SharedCollectionActivity[] = (ownedRows ?? []).map((row: any) => {
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
    };
  });

  return [...ownedActivity, ...joinedActivity]
    .filter((c) => c.role === 'owner' || c.totalMoments > 0)
    .sort((a, b) => {
      if (!a.latestAddedAt) return 1;
      if (!b.latestAddedAt) return -1;
      return b.latestAddedAt.localeCompare(a.latestAddedAt);
    });
}

// Mark a shared collection as viewed now — clears its new-moment badge.
export async function markCollectionViewed(
  collectionId: string,
  userId: string,
  role: 'owner' | 'member'
): Promise<void> {
  const now = new Date().toISOString();
  if (role === 'owner') {
    await supabase
      .from("collections")
      .update({ owner_last_viewed_at: now })
      .eq("id", collectionId)
      .eq("user_id", userId);
  } else {
    await supabase
      .from("collection_members")
      .update({ last_viewed_at: now })
      .eq("collection_id", collectionId)
      .eq("user_id", userId);
  }
}

// Fetch all moments across all contributors in a shared collection, ordered by added_at
export async function fetchSharedCollectionMoments(collectionId: string): Promise<Moment[]> {
  const { data: cmRows, error: cmError } = await supabase
    .from("collection_moments")
    .select("moment_id, added_by_user_id, added_at")
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: false });

  if (cmError) throw cmError;
  if (!cmRows || cmRows.length === 0) return [];

  const momentIds = cmRows.map((r: any) => r.moment_id);

  const { data: momentRows, error: momentError } = await supabase
    .from("moments")
    .select("*")
    .in("id", momentIds);

  if (momentError) throw momentError;

  const contributorIds = [
    ...new Set(cmRows.map((r: any) => r.added_by_user_id).filter(Boolean)),
  ];

  const { data: profiles } = contributorIds.length > 0
    ? await supabase.from("profiles").select("id, display_name").in("id", contributorIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
  const momentMap = new Map((momentRows ?? []).map((m: any) => [m.id, m]));

  return cmRows
    .map((cm: any) => {
      const row = momentMap.get(cm.moment_id);
      if (!row) return null;
      const moment = mapRowToMoment(row);
      // Guest contributions use guest_name for attribution
      if (row.guest_uuid && row.guest_name) {
        moment.contributorName = row.guest_name;
      } else {
        moment.contributorName = profileMap.get(cm.added_by_user_id) ?? null;
      }
      return moment;
    })
    .filter(Boolean) as Moment[];
}

export async function renameCollection(collectionId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ name })
    .eq("id", collectionId);
  if (error) throw error;
}

export async function addCollectionMemberById(collectionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .insert({ collection_id: collectionId, user_id: userId });
  // Ignore duplicate membership (already a member)
  if (error && error.code !== "23505") throw error;
}

export async function searchUsersForCollection(
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

// ── Collection invites ────────────────────────────────────────────────────────

export interface CollectionInvite {
  id: string;
  collectionId: string;
  collectionName: string;
  inviterName: string | null;
  createdAt: string;
}

export interface SentCollectionInvite {
  id: string;
  inviteeId: string;
  inviteeName: string | null;
  createdAt: string;
}

/** Owner sends an invite to a specific user. Silently ignores duplicate. */
export async function sendCollectionInvite(
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
export async function fetchPendingCollectionInvites(userId: string): Promise<CollectionInvite[]> {
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

/** Fetch invites the owner has sent for a collection (pending, not yet accepted). */
export async function fetchSentCollectionInvites(collectionId: string): Promise<SentCollectionInvite[]> {
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

/** Accept an invite: join the collection then delete the invite row. */
export async function acceptCollectionInvite(
  inviteId: string,
  collectionId: string,
  userId: string
): Promise<void> {
  await addCollectionMemberById(collectionId, userId);
  const { error } = await supabase
    .from("collection_invites")
    .delete()
    .eq("id", inviteId);
  if (error) throw error;
}

/** Decline or revoke an invite (works for both invitee and owner). */
export async function deleteCollectionInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_invites")
    .delete()
    .eq("id", inviteId);
  if (error) throw error;
}
