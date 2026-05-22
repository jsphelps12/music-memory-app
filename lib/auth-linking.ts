import { supabase } from "./supabase";

/**
 * Handles an incoming auth deep link from Supabase email confirmation.
 * Supabase redirects to soundtracks://?code=AUTH_CODE (PKCE flow).
 */
export async function handleAuthDeepLink(url: string): Promise<boolean> {
  // PKCE flow: code arrives as a query parameter
  const params = new URL(url);
  const code = params.searchParams.get("code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }

  return false;
}
