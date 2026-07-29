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

  // Delete every storage object under moment-photos/{user_id}/.
  // Must recurse (album covers live in {user_id}/collection_covers/) and page
  // (a single list() call caps out, silently stranding heavy users' photos in
  // a public bucket after they asked for deletion).
  async function removeAllUnder(prefix: string): Promise<number> {
    const PAGE = 100;
    let removed = 0;
    let offset = 0;

    for (;;) {
      const { data: entries, error: listError } = await adminClient.storage
        .from("moment-photos")
        .list(prefix, { limit: PAGE, offset });
      if (listError || !entries || entries.length === 0) break;

      // Entries without an `id` are folders (Supabase returns them as
      // synthetic rows) and must be recursed into rather than removed.
      const files = entries.filter((e) => e.id !== null);
      const folders = entries.filter((e) => e.id === null);

      if (files.length > 0) {
        const paths = files.map((f) => `${prefix}/${f.name}`);
        const { error: removeError } = await adminClient.storage
          .from("moment-photos")
          .remove(paths);
        if (!removeError) removed += paths.length;
      }

      for (const folder of folders) {
        removed += await removeAllUnder(`${prefix}/${folder.name}`);
      }

      if (entries.length < PAGE) break;
      // Removed files disappear from the listing, so only advance past folders.
      offset += folders.length;
    }

    return removed;
  }

  await removeAllUnder(userId);

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
