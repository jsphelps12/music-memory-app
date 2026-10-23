import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUuid } from "../_shared/uuid.ts";

// Host actions on an occasion that need the service role (docs/OCCASIONS.md,
// flow 1). Called by a signed-in host from the web setup pages.
//
//   dev-activate: { occasionId } → marks a draft paid and opens collecting.
//     The stand-in for checkout until Stripe is wired up. Refused unless the
//     function's environment sets ALLOW_DEV_PAYMENTS=true, which only
//     staging does. Stripe's webhook will call the same activate_occasion().

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
