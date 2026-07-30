import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// 520 = Supabase cold start.
//
// EVERY request gets an abort timeout, not just auth. iOS's default URL timeout
// is ~60s (and effectively never on a blackholed connection), and a hung REST
// call was able to stall startup indefinitely: the auth state listener awaits a
// profiles query, GoTrue serializes listener callbacks against session
// recovery, and the root layout's blocking overlay waits on the result. A
// bounded failure is always better than a hang.
const AUTH_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const isAuthRequest = url.includes("/auth/v1/");
  const maxRetries = 3;
  let delay = 500;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let reqInit = init;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Respect a caller-supplied signal (e.g. React Query cancellation) rather
    // than clobbering it.
    if (!init?.signal) {
      const controller = new AbortController();
      timeoutId = setTimeout(
        () => controller.abort(),
        isAuthRequest ? AUTH_TIMEOUT_MS : REQUEST_TIMEOUT_MS
      );
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

// TODO(types): createClient<Database> (types/database.ts) surfaces ~223 type
// errors across 65 files — real findings, but a dedicated migration. Until
// then, annotate row shapes explicitly with Tables<"..."> from types/database.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
    // @ts-expect-error -- lockAcquireTimeout is a valid GoTrueClient runtime option missing from the types
    lockAcquireTimeout: -1, // wait for in-flight auth ops; 10s fetch timeout above bounds the worst case
  },
  global: { fetch: fetchWithRetry },
});
