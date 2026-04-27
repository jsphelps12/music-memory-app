import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  let visitorId: string;
  try {
    const jwt = authHeader.replace("Bearer ", "");
    const segment = jwt.split(".")[1];
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(segment.length / 4) * 4, "="
    );
    const payload = JSON.parse(atob(b64));
    if (!payload.sub || payload.role !== "authenticated") return error(401, "invalid_claims");
    visitorId = payload.sub;
  } catch {
    return error(401, "decode_failed");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { token } = await req.json();
  if (!token) return error(400, "token required");

  // 1. Look up the link owner by token
  const { data: ownerProfile } = await adminClient
    .from("profiles")
    .select("id, display_name")
    .eq("friend_invite_token", token)
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
    .select("push_token")
    .eq("id", ownerId)
    .single();

  if (ownerWithToken?.push_token) {
    const visitorName = visitorProfile?.display_name ?? "Someone";
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: ownerWithToken.push_token,
        title: "New Friend!",
        body: `${visitorName} accepted your invite on Soundtracks`,
        data: { type: "friends" },
        sound: "default",
      }),
    });
  }

  return ok();
});
