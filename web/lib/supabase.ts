import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only — never import this in client components.
// Client is created lazily so build-time static analysis doesn't fail
// when env vars are absent.
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
