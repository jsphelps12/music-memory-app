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
      moment.contributorName = profileMap.get(cm.added_by_user_id) ?? null;
      return moment;
    })
    .filter(Boolean) as Moment[];
}
