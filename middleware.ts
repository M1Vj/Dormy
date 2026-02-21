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

  if (!user && !isLoginRoute && !isAuthCallbackRoute && !isOAuthConsentRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    return redirect(redirectUrl);
  }

  /**
   * Fetch the user's first membership safely — never uses .maybeSingle() so
   * multi-role users (who have multiple rows) don't get an error that resolves
   * to null, which previously caused spurious /join redirects.
   */
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

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${targetRole}/home`;
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

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${targetRole}/home`;
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
        // Force an immediate redirect to the same URL so Server Components
        // will receive the newly baked `dorm_id` within `next/headers` cookies().
        return redirect(req.nextUrl.clone());
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
