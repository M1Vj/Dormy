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
    let targetDorm = req.cookies.get("dorm_id")?.value;

    // If no active role cookie, try to find a valid role from the DB
    if (!targetRole || !targetDorm) {
      const { data: memberships } = await supabase
        .from("dorm_memberships")
        .select("role, dorm_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      targetRole = targetRole || memberships?.role || "occupant";
      if (!targetDorm && memberships?.dorm_id) {
        targetDorm = memberships.dorm_id;
        res.cookies.set("dorm_id", memberships.dorm_id, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        });
      } else if (!memberships?.dorm_id) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/join";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
    }

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${targetRole}/home`;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Also redirect if they try to visit the old flat /home route or root /
  if (user && (pathname === "/home" || pathname === "/")) {
    let targetRole = req.cookies.get("dormy_active_role")?.value;
    let targetDorm = req.cookies.get("dorm_id")?.value;

    if (!targetRole || !targetDorm) {
      const { data: memberships } = await supabase
        .from("dorm_memberships")
        .select("role, dorm_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      targetRole = targetRole || memberships?.role || "occupant";
      if (!targetDorm && memberships?.dorm_id) {
        targetDorm = memberships.dorm_id;
        res.cookies.set("dorm_id", memberships.dorm_id, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        });
      } else if (!memberships?.dorm_id) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/join";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
    }

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${targetRole}/home`;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Globally ensure `dorm_id` is set for all valid application routes if missing
  if (user && !pathname.startsWith("/_next") && !pathname.startsWith("/api") && !isLoginRoute && !isJoinRoute) {
    if (!req.cookies.has("dorm_id")) {
      const { data: memberships } = await supabase
        .from("dorm_memberships")
        .select("dorm_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (memberships?.dorm_id) {
        res.cookies.set("dorm_id", memberships.dorm_id, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        });
      } else {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/join";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/login", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
