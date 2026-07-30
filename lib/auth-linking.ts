import { supabase } from "./supabase";

/**
 * Handles an incoming auth deep link from Supabase email confirmation.
 * Supabase redirects to soundtracks://?code=AUTH_CODE (PKCE flow).
 */
export async function handleAuthDeepLink(url: string): Promise<boolean> {
  // PKCE flow: code arrives as a query parameter
  let code: string | null;
  try {
    code = new URL(url).searchParams.get("code");
  } catch {
    return false; // malformed deep link — don't reject into an unhandled promise
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }

  return false;
}
