import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { socialDelivery } from "../_shared/socialPush.ts";
import { expoPushHeaders, EXPO_PUSH_URL } from "../_shared/expoPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function error(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return error(401, "no_auth_header");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Verify the caller's JWT signature server-side. Never trust a decoded
  // payload here — this endpoint writes friendships with the service role,
  // so a forged `sub` would let anyone force a friendship with any user.
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt);
  if (authError || !user) return error(401, "unauthorized");
  const visitorId = user.id;

  let inviteToken: string | undefined;
  try {
    ({ token: inviteToken } = await req.json());
  } catch {
    return error(400, "invalid_body");
  }
  if (!inviteToken) return error(400, "token required");

  // 1. Look up the link owner by token
  const { data: ownerProfile } = await adminClient
    .from("profiles")
    .select("id, display_name")
    .eq("friend_invite_token", inviteToken)
    .single();
  if (!ownerProfile) return error(404, "not_found");

  const ownerId = ownerProfile.id;

  // 2. Self-check
  if (ownerId === visitorId) return error(400, "self_request");

  // 3. Check for any existing friendship (both directions)
  const { data: existing } = await adminClient
    .from("friendships")
    .select("id, status, requester_id, addressee_id")
    .or(`and(requester_id.eq.${ownerId},addressee_id.eq.${visitorId}),and(requester_id.eq.${visitorId},addressee_id.eq.${ownerId})`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") return ok(); // already friends
    // Upgrade any pending/declined row to accepted
    await adminClient
      .from("friendships")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    // 4. Insert accepted friendship — owner is requester (they issued the invite)
    const { error: insertError } = await adminClient
      .from("friendships")
      .insert({ requester_id: ownerId, addressee_id: visitorId, status: "accepted" });
    if (insertError) return error(500, insertError.message);
  }

  // 5. Notify the owner — they get "X is now your friend"
  const { data: visitorProfile } = await adminClient
    .from("profiles")
    .select("display_name, push_token")
    .eq("id", visitorId)
    .single();

  const { data: ownerWithToken } = await adminClient
    .from("profiles")
    .select("push_token, notif_social, notif_quiet_hours, timezone")
    .eq("id", ownerId)
    .single();

  // Off for friends, or no token: skip. At night it goes silently.
  const delivery = socialDelivery(ownerWithToken, new Date());
  if (delivery) {
    const visitorName = visitorProfile?.display_name ?? "Someone";
    // Sharing v2 "friend_added" push: mutual-by-link means opening the link IS
    // the whole ceremony, so the copy says added, not accepted. Routes to
    // People (data.type "people"); old binaries only know "friends" and land
    // on the Albums tab, which is harmless.
    // The friendship is already saved: a failed push must not turn this
    // into an error the visitor sees as a bad link.
    try {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: expoPushHeaders(Deno.env.get("EXPO_ACCESS_TOKEN")),
        body: JSON.stringify({
          ...delivery,
          title: "New friend",
          body: `${visitorName} added you on Soundtracks`,
          data: { type: "people" },
        }),
      });
    } catch (e) {
      console.error("[accept-friend-invite] push failed:", e);
    }
  }

  return ok();
});
