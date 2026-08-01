import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sharing v2 (docs/SOCIAL-ARCHITECTURE.md "Notifications"): the one edge
// function path for social pushes on v2 clients, replacing notify-friend's
// four types. friend_added is not here — it fires server-side inside
// accept-friend-invite, the only place a friendship is created. notify-friend
// stays deployed untouched for stranded old binaries until the build-23
// caboose deletes it.
//
// Push content is looked up server-side from the caller's identity and the
// moment row — the client only names the share. The moment_shares row is
// required to exist before a push goes out, so this endpoint cannot be used
// to spam arbitrary notification text at arbitrary users.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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
    if (type !== "share_received" || !toUserId || !momentId) {
      return json(400, { error: "type, toUserId and momentId required" });
    }

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
      .select("id")
      .eq("moment_id", momentId)
      .eq("recipient_id", toUserId)
      .maybeSingle();
    if (!share) return json(400, { error: "no_share" });

    const { data: senderProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", caller.id)
      .single();
    const senderName = senderProfile?.display_name ?? "Someone";

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
        body: moment.song_title
          ? `${senderName} shared ${moment.song_title} with you`
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
