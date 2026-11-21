import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUuid } from "../_shared/uuid.ts";
import { socialDelivery } from "../_shared/socialPush.ts";
import { expoPushHeaders, EXPO_PUSH_URL } from "../_shared/expoPush.ts";
import { albumInvitePush, inviteIsFresh } from "./albumInviteCopy.ts";

// album_invite (album basics, 2026-11-20): the owner invited a friend to a
// shared album from its share sheet (invite_to_album). Like share_received,
// the client only names the invite; everything in the push is looked up here.
// A push goes out only when the caller owns the album, the recipient has a
// pending invite from them made in the last few minutes, they're accepted
// friends, and the invite hasn't been announced already (notified_at, claimed
// atomically so a repeated call can't push twice).

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

function skipped(reason: string): HandlerResult {
  console.log(`[notify-social] album_invite skipped: ${reason}`);
  return { status: 200, body: { ok: true, skipped: reason } };
}

export async function handleAlbumInvite(
  adminClient: SupabaseClient<any, any, any>,
  callerId: string,
  body: { toUserId?: unknown; collectionId?: unknown }
): Promise<HandlerResult> {
  const { toUserId, collectionId } = body;
  if (!isUuid(toUserId) || !isUuid(collectionId)) {
    return { status: 400, body: { error: "type, toUserId and collectionId required" } };
  }
  if (toUserId === callerId) return { status: 400, body: { error: "invalid_recipient" } };

  // Authorize: the caller owns the album.
  const { data: album } = await adminClient
    .from("collections")
    .select("id, user_id")
    .eq("id", collectionId)
    .maybeSingle();
  if (!album || album.user_id !== callerId) return { status: 403, body: { error: "not_owner" } };

  // The invite this push announces exists, is still open, and is the caller's.
  const { data: invite } = await adminClient
    .from("collection_friend_invites")
    .select("from_user, status, created_at, notified_at")
    .eq("collection_id", collectionId)
    .eq("to_user", toUserId)
    .maybeSingle();
  if (!invite || invite.from_user !== callerId || invite.status !== "pending") {
    return { status: 400, body: { error: "no_invite" } };
  }
  if (invite.notified_at) return skipped("already_notified");
  if (!inviteIsFresh(invite.created_at, Date.now())) return skipped("stale_invite");

  // Invites are between friends: an accepted friendship either way.
  const { data: friendship } = await adminClient
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${callerId},addressee_id.eq.${toUserId}),` +
        `and(requester_id.eq.${toUserId},addressee_id.eq.${callerId})`
    )
    .limit(1)
    .maybeSingle();
  if (!friendship) return { status: 403, body: { error: "not_friends" } };

  // One push per invite: claim it before sending.
  const { data: claimed } = await adminClient
    .from("collection_friend_invites")
    .update({ notified_at: new Date().toISOString() })
    .eq("collection_id", collectionId)
    .eq("to_user", toUserId)
    .eq("status", "pending")
    .is("notified_at", null)
    .select("to_user");
  if (!claimed || claimed.length === 0) return skipped("already_notified");

  const [{ data: senderProfile }, { data: recipientProfile }] = await Promise.all([
    adminClient.from("profiles").select("display_name").eq("id", callerId).single(),
    adminClient
      .from("profiles")
      .select("push_token, notif_social, notif_quiet_hours, timezone")
      .eq("id", toUserId)
      .single(),
  ]);

  // Off for friends, or no token: nothing to send. At night it goes silently
  // (_shared/socialPush.ts).
  const delivery = socialDelivery(recipientProfile, new Date());
  if (!delivery) return skipped(recipientProfile?.push_token ? "notif_social_off" : "no_push_token");

  const pushRes = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: expoPushHeaders(Deno.env.get("EXPO_ACCESS_TOKEN")),
    body: JSON.stringify({
      ...delivery,
      ...albumInvitePush(senderProfile?.display_name, collectionId),
    }),
  });
  const pushData = await pushRes.json().catch(() => null);
  if (!pushRes.ok || pushData?.data?.status === "error") {
    console.error("[notify-social] album_invite Expo push error:", JSON.stringify(pushData));
  } else {
    // The ticket id is what Expo's receipts endpoint answers for. No names,
    // words or tokens in the log.
    const silent = delivery.interruptionLevel === "passive";
    console.log(`[notify-social] album_invite sent: ticket=${pushData?.data?.id ?? "?"} silent=${silent}`);
  }

  return { status: 200, body: { ok: true } };
}
