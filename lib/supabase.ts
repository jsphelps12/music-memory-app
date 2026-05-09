import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// 520 = Supabase cold start; auth requests get a 10s abort timeout to prevent a stuck token refresh from blocking sign-out
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const isAuthRequest = url.includes("/auth/v1/");
  const maxRetries = 3;
  let delay = 500;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let reqInit = init;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (isAuthRequest) {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10_000);
      reqInit = { ...init, signal: controller.signal };
    }

    try {
      const res = await fetch(input, reqInit);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (res.status !== 520 || attempt === maxRetries - 1) return res;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    } catch (e) {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      throw e;
    }
  }
  // Unreachable — loop always returns or throws on final attempt
  return fetch(input, init);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
    // @ts-ignore -- lockAcquireTimeout is a valid GoTrueClient runtime option missing from the types
    lockAcquireTimeout: -1, // wait for in-flight auth ops; 10s fetch timeout above bounds the worst case
  },
  global: { fetch: fetchWithRetry },
});
