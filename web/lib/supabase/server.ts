import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * A Supabase client acting as the signed-in host, from the request's
 * cookies. For server components, route handlers and server actions under
 * /host. (Public pages keep using lib/supabase.ts, the anon client.)
 */
export async function getHostSupabase() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server components can't set cookies. proxy.ts refreshes the
          // session on every /host request, so nothing is lost here.
        }
      },
    },
  });
}
