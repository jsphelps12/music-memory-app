import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guestEmailFor } from "../_shared/guestContent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USERS_PAGE = 1000;

/**
 * The id of the auth user with this email, or null. The admin API has no
 * lookup by email, so this pages through the users; it only runs on the rare
 * path where createUser failed.
 */
async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PAGE });
    if (error) {
      console.error("Failed to list users:", error);
      return null;
    }
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < USERS_PAGE) return null;
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

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { collectionId } = await req.json();
    if (!collectionId) {
      return new Response(JSON.stringify({ error: "collectionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller owns the collection
    const { data: collection, error: collectionError } = await adminClient
      .from("collections")
      .select("id, user_id, guest_user_id")
      .eq("id", collectionId)
      .single();

    if (collectionError || !collection) {
      return new Response(JSON.stringify({ error: "Collection not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (collection.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return existing guest_user_id if already created
    if (collection.guest_user_id) {
      return new Response(JSON.stringify({ guestUserId: collection.guest_user_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the guest auth user, or reuse the one an earlier call created if
    // that call stopped before saving it on the collection below. Without the
    // reuse, every retry would fail on the already-registered email.
    const email = guestEmailFor(collectionId);
    let guestUserId: string | null = null;
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (!createError && newUser.user) {
      guestUserId = newUser.user.id;
    } else {
      guestUserId = await findUserIdByEmail(adminClient, email);
      if (!guestUserId) console.error("Failed to create guest user:", createError);
    }

    if (!guestUserId) {
      return new Response(JSON.stringify({ error: "Failed to create guest user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store the guest_user_id on the collection
    const { error: updateError } = await adminClient
      .from("collections")
      .update({ guest_user_id: guestUserId })
      .eq("id", collectionId);

    if (updateError) {
      console.error("Failed to update collection:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update collection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ guestUserId }), {
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
