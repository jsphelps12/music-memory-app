import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  // Admin client uses the service role key for privileged operations.
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Validate the caller's JWT via the Auth API — this verifies signature,
  // expiry, and all other claims. Never trust the raw payload alone.
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }
  const userId = user.id;

  // Delete all storage files under moment-photos/{user_id}/
  // This covers both moment photos and the avatar (stored at {user_id}/avatar.jpg)
  const { data: files } = await adminClient.storage
    .from("moment-photos")
    .list(userId, { limit: 1000 });

  if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${f.name}`);
    await adminClient.storage.from("moment-photos").remove(paths);
  }

  // Delete the auth user — cascades to profiles, moments, collections,
  // collection_moments, and any other tables with ON DELETE CASCADE
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: corsHeaders,
  });
});
