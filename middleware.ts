import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
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
  const isAuthCallbackRoute = pathname === "/auth/callback";
  const isOAuthConsentRoute = pathname === "/oauth/consent";
  const isJoinRoute = pathname === "/join";
  const isDashboardLegacyRoute =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  if (!user && !isLoginRoute && !isAuthCallbackRoute && !isOAuthConsentRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (isLoginRoute || isOAuthConsentRoute || isDashboardLegacyRoute)) {
    let targetRole = req.cookies.get("dormy_active_role")?.value;

    // If no active role cookie, try to find a valid role from the DB
    if (!targetRole) {
      const { data: memberships } = await supabase
        .from("dorm_memberships")
        .select("role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      targetRole = memberships?.role || "occupant";
    }

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${targetRole}/home`;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Also redirect if they try to visit the old flat /home route or root /
  if (user && (pathname === "/home" || pathname === "/")) {
    let targetRole = req.cookies.get("dormy_active_role")?.value;

    if (!targetRole) {
      const { data: memberships } = await supabase
        .from("dorm_memberships")
        .select("role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      targetRole = memberships?.role || "occupant";
    }

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${targetRole}/home`;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }
  return res;
}

export const config = {
  matcher: ["/login", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
