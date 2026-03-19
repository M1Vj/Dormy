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

  const redirect = (url: URL | string) => {
    const redirectResponse = NextResponse.redirect(url);
    res.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  };

  const pathMatches = (targetPath: string, allowedPrefix: string) =>
    targetPath === allowedPrefix || targetPath.startsWith(`${allowedPrefix}/`);
  const getRouteRole = (role: string | null | undefined) =>
    role === "assistant_adviser" ? "adviser" : role;

  if (!user && !isLoginRoute && !isAuthCallbackRoute && !isOAuthConsentRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    return redirect(redirectUrl);
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

    if (!targetRole || !targetDorm) {
      const membership = await getFirstMembership();

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
        return redirect(redirectUrl);
      }
    }

    const routeRole = getRouteRole(targetRole) || "occupant";
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${routeRole}/home`;
    redirectUrl.search = "";
    return redirect(redirectUrl);
  }

  // Also redirect if they try to visit the old flat /home route or root /
  if (user && (pathname === "/home" || pathname === "/")) {
    let targetRole = req.cookies.get("dormy_active_role")?.value;
    let targetDorm = req.cookies.get("dorm_id")?.value;

    if (!targetRole || !targetDorm) {
      const membership = await getFirstMembership();

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
        return redirect(redirectUrl);
      }
    }

    const routeRole = getRouteRole(targetRole) || "occupant";
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${routeRole}/home`;
    redirectUrl.search = "";
    return redirect(redirectUrl);
  }

  // Globally ensure `dorm_id` is set for all valid application routes if missing
  if (
    user &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    !isLoginRoute &&
    !isJoinRoute
  ) {
    if (pathMatches(pathname, "/assistant_adviser")) {
      const suffix = pathname.slice("/assistant_adviser".length);
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = `/adviser${suffix || "/home"}`;
      return redirect(redirectUrl);
    }

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
        return redirect(redirectUrl);
      }
    }

    // Occupant role policy: personal reporting is replaced by dorm-level finance totals.
    if (pathname === "/occupant/reporting" || pathname.startsWith("/occupant/reporting/")) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/occupant/payments";
      redirectUrl.search = "";
      return redirect(redirectUrl);
    }

    // Role scoping: ensure users can only access their actual role prefix
    const rolePrefixes = ["admin", "adviser", "assistant_adviser", "student_assistant", "treasurer", "officer", "occupant"];
    const matchedPrefix = rolePrefixes.find(p => pathname.startsWith(`/${p}`));

    const aiBlockedPrefix = rolePrefixes.find((p) => pathMatches(pathname, `/${p}/ai`));
    if (aiBlockedPrefix) {
      const routeRole = getRouteRole(aiBlockedPrefix) || "occupant";
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = `/${routeRole}/home`;
      redirectUrl.search = "";
      return redirect(redirectUrl);
    }

    if (matchedPrefix) {
      const activeRole = req.cookies.get("dormy_active_role")?.value;
      const activeRouteRole = getRouteRole(activeRole);
      const matchedRouteRole = getRouteRole(matchedPrefix);
      if (activeRouteRole && matchedRouteRole !== activeRouteRole) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = `/${activeRouteRole}/home`;
        redirectUrl.search = "";
        return redirect(redirectUrl);
      }
    }

    if (!req.cookies.has("dorm_id")) {
      const { data } = await supabase
        .from("dorm_memberships")
        .select("dorm_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      const dormId = data?.[0]?.dorm_id ?? null;

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
        return redirect(redirectUrl);
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/login", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
