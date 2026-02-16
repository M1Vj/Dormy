import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(req: NextRequest) {
  const res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;
  const isLoginRoute = pathname === "/login";
  const isDashboardLegacyRoute =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  if (!user && !isLoginRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isLoginRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/events";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isDashboardLegacyRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/events";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/login", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
