import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type NotificationType = "friend_request" | "friend_accepted" | "moment_tagged";

function buildNotification(type: NotificationType, senderName: string, payload: Record<string, any>) {
  switch (type) {
    case "friend_request":
      return {
        title: "New Friend Request",
        body: `${senderName} wants to be friends on Soundtracks`,
        data: { type: "friends" },
      };
    case "friend_accepted":
      return {
        title: "Friend Request Accepted",
        body: `${senderName} accepted your friend request`,
        data: { type: "friends" },
      };
    case "moment_tagged":
      return {
        title: "New Memory Shared",
        body: `${senderName} tagged you in a memory`,
        data: { type: "friends", momentId: payload.momentId },
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { toUserId, type, payload } = await req.json() as {
      toUserId: string;
      type: NotificationType;
      payload: Record<string, any>;
    };

    if (!toUserId || !type) {
      return new Response(JSON.stringify({ error: "toUserId and type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender name
    const { data: senderProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", caller.id)
      .single();
    const senderName = senderProfile?.display_name ?? "Someone";

    // Get recipient push token
    const { data: recipientProfile } = await adminClient
      .from("profiles")
      .select("push_token")
      .eq("id", toUserId)
      .single();

    if (!recipientProfile?.push_token) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_push_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notification = buildNotification(type, senderName, payload ?? {});

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: recipientProfile.push_token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sound: "default",
      }),
    });
    const pushData = await pushRes.json().catch(() => null);
    if (!pushRes.ok || pushData?.data?.status === "error") {
      console.error("[notify-friend] Expo push error:", JSON.stringify(pushData));
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
