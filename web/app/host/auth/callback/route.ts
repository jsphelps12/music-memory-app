import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/occasionHost";
import { getHostSupabase } from "@/lib/supabase/server";

// The email sign-in link lands here with a one-time code (PKCE), which
// becomes the session cookie.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const back = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));

  if (!code) return back("/host/sign-in?error=link");
  const supabase = await getHostSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return back("/host/sign-in?error=link");
  return back(next);
}
