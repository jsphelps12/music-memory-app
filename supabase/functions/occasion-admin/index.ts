import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The admin view's data (docs/OCCASIONS.md, automation). Called by the
// /host/admin page with the signed-in user's JWT (verify_jwt = true); the
// caller must be in app_admins. Anyone else gets the same 404 as an unknown
// route, so the page doesn't advertise itself.
//
//   overview → admin_overview(): every occasion with what looks stuck, the
//              reservations not yet set up, recent deletions, the scheduled
//              jobs' last runs
//   tick     → occasions_tick() now, rather than waiting for the schedule

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const notFound = () => json(404, { error: "Not found." });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    // Verify the caller's JWT server-side; never trust a decoded payload.
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return notFound();
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    // A bad or expired token is a 4xx from Auth: the same 404 as anyone else.
    // Anything else means Auth itself failed, which is an error, not a stranger.
    if (authError && !(authError.status && authError.status < 500)) throw authError;
    if (!user) return notFound();
    const { data: isAdmin, error: adminError } = await admin
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!isAdmin) return notFound();

    const body = (await req.json().catch(() => null)) as { action?: string } | null;
    switch (body?.action) {
      case "overview": {
        const { data, error } = await admin.rpc("admin_overview");
        if (error) throw error;
        return json(200, data);
      }
      case "tick": {
        const { data, error } = await admin.rpc("occasions_tick").single<{ closed: number; revealed: number }>();
        if (error) throw error;
        console.log(`[occasion-admin] ${user.id} ran the tick: closed ${data.closed}, revealed ${data.revealed}`);
        return json(200, data);
      }
      default:
        return json(400, { error: "Unknown action." });
    }
  } catch (e) {
    console.error("[occasion-admin] failed:", (e as Error)?.message ?? e);
    return json(500, { error: "That didn't work." });
  }
});
