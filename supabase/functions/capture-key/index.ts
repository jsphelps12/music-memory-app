// capture-key: issues and revokes capture keys ("Remember this song",
// docs/PLAN-1.5.md section 3; table in 20261125000000_capture_keys.sql).
//
// Signed-in callers only: the JWT is verified here with the service key (and
// by the gateway, verify_jwt = true). Every write uses the service role and
// the caller's id from the verified JWT, never from the body.
//
//   POST   { deviceId, deviceLabel? }  -> 200 { key, keyId }
//          A new key for this install. The install's previous live key is
//          revoked first. The secret is returned this once and only its
//          SHA-256 is stored; it is never logged.
//   DELETE { deviceId? }               -> 200 { revoked }
//          Revokes the caller's live keys: this install's when deviceId is
//          given (sign-out), else all of them. Account deletion cascades.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanDeviceId, cleanDeviceLabel, LIMITS, newCaptureKey, sha256Hex } from "../_shared/quickCapture.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    // The POST body is a secret: never cached anywhere along the way.
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const HOUR_MS = 60 * 60 * 1000;

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (!text) return {};
    if (text.length > 4096) return null;
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/** Revokes the user's live keys (one install's when deviceId is set). Returns how many. */
async function revokeLive(admin: SupabaseClient, userId: string, deviceId: string | null): Promise<number> {
  let q = admin
    .from("capture_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (deviceId) q = q.eq("device_id", deviceId);
  const { data, error } = await q.select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

async function issue(admin: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const deviceId = cleanDeviceId(body.deviceId);
  if (!deviceId) return json(400, { error: "deviceId required" });
  const deviceLabel = cleanDeviceLabel(body.deviceLabel);

  // Keys made in the last hour, revoked ones included: a loop in a client
  // can't mint keys without end.
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const { count: recent, error: recentError } = await admin
    .from("capture_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (recentError) throw recentError;
  if ((recent ?? 0) >= LIMITS.keysPerHour) return json(429, { error: "rate_limited" });

  await revokeLive(admin, userId, deviceId);

  // At the cap, retire the least recently used live keys so this one fits.
  const { data: live, error: liveError } = await admin
    .from("capture_keys")
    .select("id, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (liveError) throw liveError;
  const excess = (live?.length ?? 0) - (LIMITS.liveKeysPerUser - 1);
  if (excess > 0 && live) {
    const lastActive = (k: { created_at: string; last_used_at: string | null }) =>
      Date.parse(k.last_used_at ?? k.created_at);
    const retire = [...live].sort((a, b) => lastActive(a) - lastActive(b)).slice(0, excess).map((k) => k.id);
    const { error: retireError } = await admin
      .from("capture_keys")
      .update({ revoked_at: new Date().toISOString() })
      .in("id", retire)
      .eq("user_id", userId);
    if (retireError) throw retireError;
  }

  // A second request from the same install racing this one: the live-key
  // index refuses the loser, which revokes the winner's key and tries once
  // more, so the install ends up with exactly the key it was handed.
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = newCaptureKey();
    const { data, error } = await admin
      .from("capture_keys")
      .insert({ user_id: userId, key_hash: await sha256Hex(key), device_id: deviceId, device_label: deviceLabel })
      .select("id")
      .single<{ id: string }>();
    if (!error) return json(200, { key, keyId: data.id });
    if (error.code !== "23505" || attempt === 1) throw error;
    await revokeLive(admin, userId, deviceId);
  }
  throw new Error("unreachable");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "DELETE") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "no_auth_header" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the JWT's signature with the Auth API; never trust a decoded
  // payload. The key this issues writes moments as this user.
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) return json(401, { error: "unauthorized" });

  const body = await readJson(req);
  if (!body) return json(400, { error: "invalid_body" });

  try {
    if (req.method === "POST") return await issue(admin, user.id, body);

    let deviceId: string | null = null;
    if (body.deviceId !== undefined) {
      deviceId = cleanDeviceId(body.deviceId);
      if (!deviceId) return json(400, { error: "invalid deviceId" });
    }
    return json(200, { revoked: await revokeLive(admin, user.id, deviceId) });
  } catch (e) {
    // Database messages only; nothing here can contain the secret.
    console.error("[capture-key] failed:", (e as { message?: string })?.message ?? "unknown");
    return json(500, { error: "server_error" });
  }
});
