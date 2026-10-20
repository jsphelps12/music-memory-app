// Legacy social-push endpoint, called only by old binaries (friend requests,
// tagging and resonate from before Sharing v2). Current clients use
// notify-social and accept-friend-invite. It stays deployed so those old
// builds get a clean response instead of a 404, but it no longer sends
// anything. The build-23 caboose deletes it.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(JSON.stringify({ ok: true, skipped: "deprecated" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
