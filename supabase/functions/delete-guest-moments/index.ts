import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isAlbumGuestUser,
  isUuid,
  purgeAlbumGuestContent,
  removeGuestMomentPhotos,
} from "../_shared/guestContent.ts";

// Album owners removing guest contributions. Guest moments belong to the
// album's guest auth user and their photos live under guest/{guest_uuid}/, so
// the owner's own session can delete neither the photos nor (on album
// deletion) the guest user. This does both with the service role, after
// checking the caller owns the album.
//
//   { momentId }      delete one guest moment and its photos. Call this
//                     INSTEAD of deleting the row from the client: once the
//                     row is gone there is nothing left to check against.
//   { collectionId }  delete every guest moment in the album, their photos,
//                     and the album's guest user. Call before deleting the
//                     album.
//
// Photos are deleted first; if any fail, the row (or guest user) is kept and
// the call returns 500 so it can be retried.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "unauthorized" });
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !caller) return json(401, { error: "unauthorized" });

    let body: { momentId?: unknown; collectionId?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid_body" });
    }

    // ── Whole album ────────────────────────────────────────────────────────
    if (body.collectionId !== undefined) {
      if (!isUuid(body.collectionId)) return json(400, { error: "invalid_collection" });
      const { data: collection } = await admin
        .from("collections")
        .select("id, user_id, guest_user_id")
        .eq("id", body.collectionId)
        .maybeSingle();
      if (!collection) return json(404, { error: "not_found" });
      if (collection.user_id !== caller.id) return json(403, { error: "forbidden" });

      const result = await purgeAlbumGuestContent(admin, collection);
      if (!result.ok) return json(500, { error: "cleanup_failed" });
      return json(200, { ok: true, deleted: result.moments });
    }

    // ── One moment ─────────────────────────────────────────────────────────
    if (!isUuid(body.momentId)) return json(400, { error: "momentId or collectionId required" });

    const { data: moment } = await admin
      .from("moments")
      .select("id, user_id, guest_uuid")
      .eq("id", body.momentId)
      .maybeSingle();
    if (!moment) return json(404, { error: "not_found" });
    if (!moment.guest_uuid) return json(400, { error: "not_guest_moment" });

    // The caller must own an album that (a) contains this moment and (b) has
    // the moment's owner as its guest user.
    const { data: links } = await admin
      .from("collection_moments")
      .select("collection_id, collections!inner(id, user_id, guest_user_id)")
      .eq("moment_id", moment.id)
      .eq("collections.user_id", caller.id)
      .eq("collections.guest_user_id", moment.user_id);
    const link = (links ?? [])[0];
    if (!link) return json(403, { error: "forbidden" });
    if (!(await isAlbumGuestUser(admin, moment.user_id, link.collection_id))) {
      return json(403, { error: "forbidden" });
    }

    const failed = await removeGuestMomentPhotos(admin, moment.guest_uuid);
    if (failed > 0) return json(500, { error: "cleanup_failed" });

    const { error: deleteError } = await admin.from("moments").delete().eq("id", moment.id);
    if (deleteError) {
      console.error("[delete-guest-moments] delete failed:", deleteError.message);
      return json(500, { error: "delete_failed" });
    }

    return json(200, { ok: true, deleted: 1 });
  } catch (err) {
    console.error("[delete-guest-moments] Unexpected error:", err);
    return json(500, { error: "Internal server error" });
  }
});
