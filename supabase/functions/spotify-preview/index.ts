import { createClient } from "jsr:@supabase/supabase-js@2";

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "";

// Cache the access token for up to 55 minutes (token lives 60 min)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const creds = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error("spotify_token_failed");

  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000;
  return cachedToken!;
}

Deno.serve(async (req) => {
  // Verify caller is an authenticated Soundtracks user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const spotifyId = url.searchParams.get("id");
  if (!spotifyId) {
    return new Response(JSON.stringify({ error: "missing_id" }), { status: 400 });
  }

  try {
    const token = await getSpotifyToken();
    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${spotifyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!trackRes.ok) {
      return new Response(JSON.stringify({ previewUrl: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const track = await trackRes.json();
    return new Response(JSON.stringify({ previewUrl: track.preview_url ?? null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ previewUrl: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
