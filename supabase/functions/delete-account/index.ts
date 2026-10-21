import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { removeAllUnder } from "../_shared/storage.ts";
import { purgeAlbumGuestContent } from "../_shared/guestContent.ts";

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

  const cleanupFailed = () =>
    new Response(
      JSON.stringify({ error: "We couldn't finish deleting your data. Please try again." }),
      { status: 500, headers: corsHeaders }
    );

  // 1. Guest contributions to this user's albums: owned by each album's guest
  //    auth user, with photos under guest/. Neither cascades from this user,
  //    so delete them first, while the albums still say which guest user
  //    belongs to which album.
  const { data: guestAlbums, error: albumsError } = await adminClient
    .from("collections")
    .select("id, guest_user_id")
    .eq("user_id", userId)
    .not("guest_user_id", "is", null);
  if (albumsError) {
    console.error("[delete-account] listing albums failed:", albumsError.message);
    return cleanupFailed();
  }
  for (const album of guestAlbums ?? []) {
    const result = await purgeAlbumGuestContent(adminClient, album);
    if (!result.ok) return cleanupFailed();
  }

  // 1b. Occasions this user hosts cascade away with the user, but their
  //     photos (guests' and the gallery) live in the private occasion-photos
  //     bucket under {occasion_id}/, which nothing cascades to. Occasions
  //     they only co-host survive (co_host_user_id goes null).
  const { data: hosted, error: occasionsError } = await adminClient
    .from("occasions")
    .select("id")
    .eq("host_user_id", userId);
  if (occasionsError) {
    console.error("[delete-account] listing occasions failed:", occasionsError.message);
    return cleanupFailed();
  }
  for (const occasion of hosted ?? []) {
    const { failed } = await removeAllUnder(adminClient, occasion.id, "occasion-photos");
    if (failed > 0) return cleanupFailed();
  }

  // 2. Every storage object under moment-photos/{user_id}/. Recurses (album
  //    covers live in {user_id}/collection_covers/) and pages (a single list()
  //    call caps out). If anything is left behind, stop before deleting the
  //    user so the request can be retried; afterwards nothing would point at
  //    those public files any more.
  const { failed } = await removeAllUnder(adminClient, userId);
  if (failed > 0) return cleanupFailed();

  // 3. Delete the auth user — cascades to profiles, moments, collections,
  //    collection_moments, occasions (and their entries and gallery rows),
  //    and any other tables with ON DELETE CASCADE
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
