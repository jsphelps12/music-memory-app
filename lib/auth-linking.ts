import { supabase } from "./supabase";

/**
 * Handles an incoming auth deep link from Supabase email confirmation.
 * With PKCE flow, Supabase redirects to tracks://?code=AUTH_CODE
 * which we exchange for a session.
 */
export async function handleAuthDeepLink(url: string): Promise<boolean> {
  // PKCE flow: code arrives as a query parameter
  const params = new URL(url);
  const code = params.searchParams.get("code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }

  // Implicit flow fallback: tokens in hash fragment
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return false;

  const hashParams = new URLSearchParams(url.substring(hashIndex + 1));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (!accessToken || !refreshToken) return false;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return !error;
}
