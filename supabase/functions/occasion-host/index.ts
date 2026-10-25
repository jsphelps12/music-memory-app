import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { removeAllUnder } from "../_shared/storage.ts";
import { isUuid } from "../_shared/uuid.ts";

// Host actions on an occasion that need the service role (docs/OCCASIONS.md,
// flow 1). Called by a signed-in host from the web setup pages.
//
//   dev-activate: { occasionId } → marks a draft paid and opens collecting.
//     The stand-in for checkout until Stripe is wired up. Refused unless the
//     function's environment sets ALLOW_DEV_PAYMENTS=true, which only
//     staging does. Stripe's webhook will call the same activate_occasion().
//
//   delete-wedding: { occasionId } → closes it to guests, removes every
//     photo under occasion-photos/{occasionId}/ (guests' and the gallery),
//     deletes the occasion (its entries cascade; a trigger keeps the link
//     retired and any payment on record), then sweeps the photos once more
//     for an upload that was already in flight. Primary host only. If a
//     photo won't delete, the occasion stays so the couple can try again.
//     Clients have no DELETE on occasions, so this is the only way.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function deleteWedding(admin: SupabaseClient, userId: string, occasionId: unknown) {
  if (!isUuid(occasionId)) return json(400, { error: "Unknown wedding." });
  const { data: occasion, error } = await admin
    .from("occasions")
    .select("id, host_user_id")
    .eq("id", occasionId)
    .maybeSingle<{ id: string; host_user_id: string }>();
  if (error) throw error;
  if (!occasion || occasion.host_user_id !== userId) {
    return json(404, { error: "Only the person who set up this wedding can delete it." });
  }
  // Stop new guest uploads first (occasion-entry refuses once the close passes).
  const { error: closeError } = await admin
    .from("occasions")
    .update({ collect_closes_at: new Date().toISOString() })
    .eq("id", occasion.id)
    .eq("status", "collecting");
  if (closeError) throw closeError;
  const { failed } = await removeAllUnder(admin, occasion.id, "occasion-photos");
  if (failed > 0) {
    console.error(`[occasion-host] delete-wedding: ${failed} photo(s) failed to delete under ${occasion.id}`);
    return json(500, { error: "Some photos didn't delete, so nothing was removed. Try again." });
  }
  const { error: deleteError } = await admin.from("occasions").delete().eq("id", occasion.id);
  if (deleteError) throw deleteError;
  // A guest request that was mid-upload when we closed can still land a file.
  const late = await removeAllUnder(admin, occasion.id, "occasion-photos");
  if (late.failed > 0) console.error(`[occasion-host] delete-wedding: ${late.failed} late photo(s) left under ${occasion.id}`);
  return json(200, { deleted: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // Verify the caller's JWT server-side; never trust a decoded payload.
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "Sign in again." });
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user) return json(401, { error: "Sign in again." });

    const body = (await req.json().catch(() => null)) as { action?: string; occasionId?: unknown } | null;
    if (body?.action === "delete-wedding") return await deleteWedding(admin, user.id, body.occasionId);
    if (!body || body.action !== "dev-activate") return json(400, { error: "Unknown action." });
    if (Deno.env.get("ALLOW_DEV_PAYMENTS") !== "true") {
      return json(403, { error: "Checkout isn't open yet." });
    }
    if (!isUuid(body.occasionId)) return json(400, { error: "Unknown wedding." });

    const { data: occasion, error } = await admin
      .from("occasions")
      .select("id, host_user_id, co_host_user_id, status")
      .eq("id", body.occasionId)
      .maybeSingle<{ id: string; host_user_id: string; co_host_user_id: string | null; status: string }>();
    if (error) throw error;
    if (!occasion || (occasion.host_user_id !== user.id && occasion.co_host_user_id !== user.id)) {
      return json(404, { error: "Unknown wedding." });
    }

    const { data: activated, error: activateError } = await admin
      .rpc("activate_occasion", { p_occasion_id: occasion.id, p_checkout_id: `dev_${crypto.randomUUID()}` })
      .single<{ status: string; collect_closes_at: string }>();
    if (activateError) throw activateError;
    return json(200, { status: activated.status, collectClosesAt: activated.collect_closes_at });
  } catch (e) {
    console.error("[occasion-host] failed:", (e as Error)?.message ?? e);
    return json(500, { error: "Something went wrong. Try again." });
  }
});
