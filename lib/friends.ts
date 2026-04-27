import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { Friendship, TaggedMoment } from "@/types";

export interface ProfileResult {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  username: string | null;
  friendInviteToken: string;
}

function mapFriendshipRow(row: any, currentUserId: string): Friendship {
  const isRequester = row.requester_id === currentUserId;
  const otherUserId = isRequester ? row.addressee_id : row.requester_id;
  const profile = row.other_profile ?? null;
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    otherUserId,
    otherUserDisplayName: profile?.display_name ?? null,
    otherUserAvatarUrl: profile?.avatar_url ?? null,
    otherUserUsername: profile?.username ?? null,
  };
}

async function enrichFriendships(rows: any[], currentUserId: string): Promise<Friendship[]> {
  if (!rows || rows.length === 0) return [];
  const otherIds = rows.map((r) =>
    r.requester_id === currentUserId ? r.addressee_id : r.requester_id
  );
  const uniqueIds = [...new Set(otherIds)];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, username")
    .in("id", uniqueIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map((row) => {
    const otherId = row.requester_id === currentUserId ? row.addressee_id : row.requester_id;
    return mapFriendshipRow({ ...row, other_profile: profileMap.get(otherId) ?? null }, currentUserId);
  });
}

export async function fetchFriends(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "accepted");
  if (error) throw error;
  return enrichFriendships(data ?? [], userId);
}

export async function fetchPendingRequests(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("addressee_id", userId)
    .eq("status", "pending");
  if (error) throw error;
  return enrichFriendships(data ?? [], userId);
}

export async function fetchSentRequests(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("requester_id", userId)
    .eq("status", "pending");
  if (error) throw error;
  return enrichFriendships(data ?? [], userId);
}

export async function sendFriendRequest(toUserId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  if (session.user.id === toUserId) throw new Error("self_request");

  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: session.user.id, addressee_id: toUserId });
  if (error) {
    // Unique constraint = already connected
    if (error.code === "23505") throw new Error("already_connected");
    throw error;
  }

  // Notify the recipient
  await supabase.functions.invoke("notify-friend", {
    body: { toUserId, type: "friend_request", payload: {} },
  }).catch((err) => { if (__DEV__) console.warn("[notify-friend]", err); });
}

export async function acceptFriendInvite(token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("accept-friend-invite", {
    body: { token },
  });
  // Check typed errors from response body first (edge fn may return 4xx with JSON body)
  if (data?.error === "self_request") throw new Error("self_request");
  if (data?.error === "not_found") throw new Error("not_found");
  if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Unknown error");
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { data: friendship, error: fetchError } = await supabase
    .from("friendships")
    .select("requester_id")
    .eq("id", friendshipId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", friendshipId);
  if (error) throw error;

  await supabase.functions.invoke("notify-friend", {
    body: { toUserId: friendship.requester_id, type: "friend_accepted", payload: {} },
  }).catch((err) => { if (__DEV__) console.warn("[notify-friend]", err); });
}

export async function declineFriendRequest(friendshipId: string): Promise<void> {
  // DELETE instead of UPDATE so both parties can reconnect later
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) throw error;
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) throw error;
}

export async function cancelFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) throw error;
}

export async function searchByUsername(query: string, currentUserId: string): Promise<ProfileResult[]> {
  if (!query.trim()) return [];

  // Exclude users already in any friendship (pending, accepted, declined)
  const { data: existingFriendships } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);
  const excludeIds = new Set([currentUserId]);
  (existingFriendships ?? []).forEach((f: any) => {
    excludeIds.add(f.requester_id === currentUserId ? f.addressee_id : f.requester_id);
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, username, friend_invite_token")
    .ilike("username", `%${query.trim()}%`)
    .not("id", "in", `(${[...excludeIds].join(",")})`)
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    username: row.username,
    friendInviteToken: row.friend_invite_token,
  }));
}

export function getFriendInviteUrl(token: string): string {
  return `https://soundtracks.app/friend/${token}`;
}

export async function fetchProfileByFriendToken(token: string): Promise<ProfileResult | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, username, friend_invite_token")
    .eq("friend_invite_token", token)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    username: data.username,
    friendInviteToken: data.friend_invite_token,
  };
}

export async function checkUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
  if (!username.trim()) return false;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", username.trim())
    .neq("id", currentUserId)
    .limit(1)
    .maybeSingle();
  return !data;
}

// ── Tagged moments ──────────────────────────────────────────────────────────

function mapTaggedMomentRow(row: any): TaggedMoment {
  return {
    id: row.id,
    momentId: row.moment_id,
    taggerUserId: row.tagger_user_id,
    taggedUserId: row.tagged_user_id,
    released: row.released,
    status: row.status,
    tagToken: row.tag_token,
    createdAt: row.created_at,
    taggerDisplayName: row.tagger_display_name ?? null,
    taggerAvatarUrl: row.tagger_avatar_url ?? null,
    moment: row.moment_row ? mapRowToMoment(row.moment_row) : undefined,
  };
}

export async function fetchTaggedMomentsInbox(userId: string): Promise<TaggedMoment[]> {
  const { data, error } = await supabase
    .from("tagged_moments")
    .select("*")
    .eq("tagged_user_id", userId)
    .eq("released", true)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const taggerIds = [...new Set(data.map((r: any) => r.tagger_user_id))];
  const momentIds = data.map((r: any) => r.moment_id);

  const [{ data: profiles }, { data: moments }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url").in("id", taggerIds),
    supabase.rpc("get_tagged_moment_data", { p_moment_ids: momentIds }),
  ]);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const momentMap = new Map((moments ?? []).map((m: any) => [m.id, m]));

  return data.map((row: any) => {
    const taggerProfile = profileMap.get(row.tagger_user_id);
    const momentRow = momentMap.get(row.moment_id);
    return mapTaggedMomentRow({
      ...row,
      tagger_display_name: taggerProfile?.display_name ?? null,
      tagger_avatar_url: taggerProfile?.avatar_url ?? null,
      moment_row: momentRow ?? null,
    });
  });
}

export async function fetchAcceptedTaggedMoments(userId: string): Promise<TaggedMoment[]> {
  const { data, error } = await supabase
    .from("tagged_moments")
    .select("*")
    .eq("tagged_user_id", userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const taggerIds = [...new Set(data.map((r: any) => r.tagger_user_id))];
  const momentIds = data.map((r: any) => r.moment_id);

  const [{ data: profiles }, { data: moments }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url").in("id", taggerIds),
    supabase.rpc("get_tagged_moment_data", { p_moment_ids: momentIds }),
  ]);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const momentMap = new Map((moments ?? []).map((m: any) => [m.id, m]));

  return data.map((row: any) => {
    const taggerProfile = profileMap.get(row.tagger_user_id);
    const momentRow = momentMap.get(row.moment_id);
    return mapTaggedMomentRow({
      ...row,
      tagger_display_name: taggerProfile?.display_name ?? null,
      tagger_avatar_url: taggerProfile?.avatar_url ?? null,
      moment_row: momentRow ?? null,
    });
  });
}

export async function fetchTagsOnMoment(momentId: string): Promise<TaggedMoment[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from("tagged_moments")
    .select("*")
    .eq("moment_id", momentId)
    .eq("tagger_user_id", session.user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const taggedIds = data.map((r: any) => r.tagged_user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", taggedIds);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return data.map((row: any) => {
    const taggedProfile = profileMap.get(row.tagged_user_id);
    return mapTaggedMomentRow({
      ...row,
      // For tags-on-moment view, we show the tagged user's info in tagger fields slot
      tagger_display_name: taggedProfile?.display_name ?? null,
      tagger_avatar_url: taggedProfile?.avatar_url ?? null,
    });
  });
}

export async function insertTaggedMoment(
  momentId: string,
  taggedUserId: string,
  released: boolean
): Promise<TaggedMoment> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("tagged_moments")
    .insert({
      moment_id: momentId,
      tagger_user_id: session.user.id,
      tagged_user_id: taggedUserId,
      released,
    })
    .select()
    .single();
  if (error) throw error;

  if (released) {
    await supabase.functions.invoke("notify-friend", {
      body: { toUserId: taggedUserId, type: "moment_tagged", payload: { momentId } },
    }).catch((err) => { if (__DEV__) console.warn("[notify-friend]", err); });
  }

  return mapTaggedMomentRow({ ...data, tagger_display_name: null, tagger_avatar_url: null });
}

export async function releaseTag(taggedMomentId: string): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from("tagged_moments")
    .select("tagged_user_id, moment_id")
    .eq("id", taggedMomentId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from("tagged_moments")
    .update({ released: true, updated_at: new Date().toISOString() })
    .eq("id", taggedMomentId);
  if (error) throw error;

  await supabase.functions.invoke("notify-friend", {
    body: { toUserId: row.tagged_user_id, type: "moment_tagged", payload: { momentId: row.moment_id } },
  }).catch((err) => { if (__DEV__) console.warn("[notify-friend]", err); });
}

export async function acceptTaggedMoment(taggedMomentId: string): Promise<void> {
  const { error } = await supabase
    .from("tagged_moments")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", taggedMomentId);
  if (error) throw error;
}

export async function hideTaggedMoment(taggedMomentId: string): Promise<void> {
  const { error } = await supabase
    .from("tagged_moments")
    .update({ status: "hidden", updated_at: new Date().toISOString() })
    .eq("id", taggedMomentId);
  if (error) throw error;
}
