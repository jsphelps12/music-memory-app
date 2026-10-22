import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Host pages (/host/*) need a signed-in couple. This refreshes the Supabase
// session cookie on every host request (server components can't write
// cookies) and sends anyone signed out to sign-in, remembering where they
// were going. Everything else on the site is public and never reaches here.
const PUBLIC_HOST_PATHS = ["/host/sign-in", "/host/auth/callback"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() checks the token with Supabase (getSession() would trust the
  // cookie as-is), and refreshes it when it's close to expiring.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC_HOST_PATHS.some((p) => path.startsWith(p))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/host/sign-in";
    signIn.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: ["/host/:path*"],
};
