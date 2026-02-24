import { supabase } from "@/lib/supabase";
import { Collection } from "@/types";

export async function fetchCollections(userId: string): Promise<Collection[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("id, user_id, name, created_at, collection_moments(moment_id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    momentCount: (row.collection_moments ?? []).length,
  }));
}

export async function createCollection(userId: string, name: string): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: userId, name })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    createdAt: data.created_at,
    momentCount: 0,
  };
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}

export async function addMomentToCollection(collectionId: string, momentId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_moments")
    .insert({ collection_id: collectionId, moment_id: momentId });
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
