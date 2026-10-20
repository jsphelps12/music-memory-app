import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { fetchWithRetry } from "@/lib/fetchWithRetry";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Timeouts and the 520 (cold start) retry live in lib/fetchWithRetry.ts.

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
    lockAcquireTimeout: -1, // wait for in-flight auth ops; the 10s auth fetch timeout bounds the worst case
  },
  global: { fetch: fetchWithRetry },
});
