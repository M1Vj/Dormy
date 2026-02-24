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

  console.log(`\n[Middleware] [${new Date().toISOString()}] Request: ${pathname}`);
  console.log(`[Middleware] User ID: ${user?.id ? user.id : "NO_USER"}`);
  console.log(`[Middleware] Cookies incoming:`, JSON.stringify(req.cookies.getAll().map(c => c.name)));

  const redirect = (url: URL | string, reason: string) => {
    console.log(`[Middleware] Redirecting to ${url.toString()} | Reason: ${reason}`);
    const redirectResponse = NextResponse.redirect(url);
    res.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  };

  const pathMatches = (targetPath: string, allowedPrefix: string) =>
    targetPath === allowedPrefix || targetPath.startsWith(`${allowedPrefix}/`);

  if (!user && !isLoginRoute && !isAuthCallbackRoute && !isOAuthConsentRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    return redirect(redirectUrl, "No user, redirecting to login");
  }

  const getFirstMembership = async (): Promise<{
    role: string;
    dorm_id: string;
  } | null> => {
    const { data } = await supabase
      .from("dorm_memberships")
      .select("role, dorm_id")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: true })
      .limit(1);
    return data?.[0] ?? null;
  };

  if (user && (isLoginRoute || isOAuthConsentRoute || isDashboardLegacyRoute)) {
    let targetRole = req.cookies.get("dormy_active_role")?.value;
    let targetDorm = req.cookies.get("dorm_id")?.value;
    console.log(`[Middleware] Auth/Legacy route logic. Incoming roles - activeRole: ${targetRole}, dorm: ${targetDorm}`);

    if (!targetRole || !targetDorm) {
      const membership = await getFirstMembership();
      console.log(`[Middleware] Fetched membership:`, membership);

      targetRole = targetRole || membership?.role || "occupant";
      if (!targetDorm && membership?.dorm_id) {
        targetDorm = membership.dorm_id;
        res.cookies.set("dorm_id", membership.dorm_id, {
          path: "/",
          httpOnly: true, // Safari sometimes drops cookies on localhost if secure rules conflict, but httpOnly+lax is usually ok
          sameSite: "lax",
        });
      } else if (!membership?.dorm_id) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/join";
        redirectUrl.search = "";
        return redirect(redirectUrl, "Auth/Legacy route: No membership found, redirecting to /join");
      }
    }

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${targetRole}/home`;
    redirectUrl.search = "";
    return redirect(redirectUrl, `Auth/Legacy route: Redirecting heavily to role home -> /${targetRole}/home`);
  }

  // Also redirect if they try to visit the old flat /home route or root /
  if (user && (pathname === "/home" || pathname === "/")) {
    let targetRole = req.cookies.get("dormy_active_role")?.value;
    let targetDorm = req.cookies.get("dorm_id")?.value;
    console.log(`[Middleware] /home or / route logic. activeRole: ${targetRole}, dorm: ${targetDorm}`);

    if (!targetRole || !targetDorm) {
      const membership = await getFirstMembership();
      console.log(`[Middleware] Fetched membership for /home:`, membership);

      targetRole = targetRole || membership?.role || "occupant";
      if (!targetDorm && membership?.dorm_id) {
        targetDorm = membership.dorm_id;
        res.cookies.set("dorm_id", membership.dorm_id, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        });
      } else if (!membership?.dorm_id) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/join";
        redirectUrl.search = "";
        return redirect(redirectUrl, "/home route: No membership found, redirecting to /join");
      }
    }

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${targetRole}/home`;
    redirectUrl.search = "";
    return redirect(redirectUrl, `/home route: redirecting to role path /${targetRole}/home`);
  }

  // Globally ensure `dorm_id` is set for all valid application routes if missing
  if (
    user &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    !isLoginRoute &&
    !isJoinRoute
  ) {
    // Admin scope restriction: keep admin pages focused on dorm setup, occupants, clearance, and semesters.
    if (pathname.startsWith("/admin")) {
      const allowedAdminPrefixes = [
        "/admin/home",
        "/admin/occupants",
        "/admin/dorms",
        "/admin/clearance",
        "/admin/terms",
        "/admin/announcements",
        "/admin/profile",
        "/admin/settings",
      ];

      const isAllowedAdminRoute =
        pathname === "/admin" ||
        allowedAdminPrefixes.some((prefix) => pathMatches(pathname, prefix));
      if (!isAllowedAdminRoute) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/admin/home";
        redirectUrl.search = "";
        return redirect(redirectUrl, "Admin route restricted by role policy.");
      }
    }

    // Occupant role policy: personal reporting is replaced by dorm-level finance totals.
    if (pathname === "/occupant/reporting" || pathname.startsWith("/occupant/reporting/")) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/occupant/payments";
      redirectUrl.search = "";
      return redirect(redirectUrl, "Occupant reporting route redirected to dorm finance totals.");
    }

    if (!req.cookies.has("dorm_id")) {
      console.log(`[Middleware] User has no dorm_id cookie on app route ${pathname}. Attempting to set it...`);
      const { data } = await supabase
        .from("dorm_memberships")
        .select("dorm_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      const dormId = data?.[0]?.dorm_id ?? null;
      console.log(`[Middleware] Fetched dormId to bake into cookie: ${dormId}`);

      if (dormId) {
        res.cookies.set("dorm_id", dormId, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        });
        // Now that `getActiveDormId` falls back safely, we don't need to force a redirect.
        // The cookie will be set for future requests, and the current request will
        // use the DB fallback gracefully.
        return res;
      } else {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/join";
        redirectUrl.search = "";
        return redirect(redirectUrl, `No dorm membership found for app route ${pathname}, redirecting to /join`);
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/login", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
