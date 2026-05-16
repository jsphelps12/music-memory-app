import { supabase } from "@/lib/supabase";

/** Check if the current user has resonated on a moment. */
export async function fetchMyReaction(momentId: string): Promise<boolean> {
  const { data } = await supabase
    .from("moment_reactions")
    .select("id")
    .eq("moment_id", momentId)
    .eq("type", "resonance")
    .maybeSingle();
  return !!data;
}

/** Count all resonances on a moment. Only works for the moment owner (RLS). */
export async function fetchReactionCount(momentId: string): Promise<number> {
  const { count } = await supabase
    .from("moment_reactions")
    .select("id", { count: "exact", head: true })
    .eq("moment_id", momentId)
    .eq("type", "resonance");
  return count ?? 0;
}

/** Add a resonance reaction. Silently ignores if already reacted. */
export async function addReaction(momentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("moment_reactions")
    .insert({ moment_id: momentId, user_id: userId, type: "resonance" });
  if (error && error.code !== "23505") throw error;
}

/** Remove a resonance reaction. */
export async function removeReaction(momentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("moment_reactions")
    .delete()
    .eq("moment_id", momentId)
    .eq("user_id", userId)
    .eq("type", "resonance");
  if (error) throw error;
}
