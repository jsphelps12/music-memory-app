import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Retry on 520 (Supabase cold start on free tier) with backoff
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const maxRetries = 3;
  let delay = 500;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 520 || attempt === maxRetries - 1) return res;
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
  // Unreachable — loop always returns on final attempt
  return fetch(input, init);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
  global: { fetch: fetchWithRetry },
});
