import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUuid } from "../_shared/uuid.ts";

// Sharing v2 (docs/SOCIAL-ARCHITECTURE.md "Notifications"): the one edge
// function path for social pushes on v2 clients, replacing notify-friend's
// four types. friend_added is not here — it fires server-side inside
// accept-friend-invite, the only place a friendship is created. notify-friend
// stays deployed (as a no-op) for stranded old binaries until the build-23
// caboose deletes it.
//
// Push content is looked up server-side from the caller's identity and the
// moment row — the client only names the share. A push goes out only for a
// share the caller sent in the last few minutes, to an accepted friend.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Only a share sent in the last few minutes is announced; the app calls this
// right after inserting the row.
const SHARE_PUSH_WINDOW_MS = 5 * 60 * 1000;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "unauthorized" });

    // Verify the caller's JWT signature server-side — never trust a decoded
    // payload for identity.
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(jwt);
    if (authError || !caller) return json(401, { error: "unauthorized" });

    let body: { type?: string; toUserId?: string; momentId?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid_body" });
    }
    const { type, toUserId, momentId } = body;
    if (type !== "share_received" || !isUuid(toUserId) || !isUuid(momentId)) {
      return json(400, { error: "type, toUserId and momentId required" });
    }
    if (toUserId === caller.id) return json(400, { error: "invalid_recipient" });

    // Authorize: the caller owns the moment, and the grant row this push
    // announces actually exists.
    const { data: moment } = await adminClient
      .from("moments")
      .select("id, user_id, song_title")
      .eq("id", momentId)
      .single();
    if (!moment || moment.user_id !== caller.id) return json(403, { error: "not_owner" });

    const { data: share } = await adminClient
      .from("moment_shares")
      .select("id, sender_id, created_at")
      .eq("moment_id", momentId)
      .eq("recipient_id", toUserId)
      .maybeSingle();
    if (!share || share.sender_id !== caller.id) return json(400, { error: "no_share" });

    // The push announces a share that was just sent; an old share doesn't
    // push again.
    const sharedAt = Date.parse(share.created_at);
    if (!Number.isFinite(sharedAt) || Date.now() - sharedAt > SHARE_PUSH_WINDOW_MS) {
      return json(200, { ok: true, skipped: "stale_share" });
    }

    // Sharing is between friends: require an accepted friendship either way.
    const { data: friendship } = await adminClient
      .from("friendships")
      .select("id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${caller.id},addressee_id.eq.${toUserId}),` +
          `and(requester_id.eq.${toUserId},addressee_id.eq.${caller.id})`
      )
      .limit(1)
      .maybeSingle();
    if (!friendship) return json(403, { error: "not_friends" });

    const { data: senderProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", caller.id)
      .single();
    const senderName = clip(senderProfile?.display_name || "Someone", 40);
    const songTitle = moment.song_title ? clip(moment.song_title, 80) : "";

    const { data: recipientProfile } = await adminClient
      .from("profiles")
      .select("push_token")
      .eq("id", toUserId)
      .single();
    if (!recipientProfile?.push_token) {
      return json(200, { ok: true, skipped: "no_push_token" });
    }

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: recipientProfile.push_token,
        title: "Shared with you",
        body: songTitle
          ? `${senderName} shared ${songTitle} with you`
          : `${senderName} shared a moment with you`,
        data: { type: "shared_moment", momentId },
        sound: "default",
      }),
    });
    const pushData = await pushRes.json().catch(() => null);
    if (!pushRes.ok || pushData?.data?.status === "error") {
      console.error("[notify-social] Expo push error:", JSON.stringify(pushData));
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("[notify-social] Unexpected error:", err);
    return json(500, { error: "Internal server error" });
  }
});
