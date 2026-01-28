import Link from "next/link";
import { PropsWithChildren } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function AppShell({ children }: PropsWithChildren) {
  // Attempt to configure Supabase; if not available, fall back to safe defaults
  let role: "admin" | "student_assistant" | "treasurer" | "occupant" = "occupant";
  let hasUser = false;
  let signOut: (() => Promise<void>) | null = null;
  let supabase: SupabaseClient | null = null;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    supabase = null;
  }
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        hasUser = true;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name")
          .eq("user_id", data.user.id)
          .maybeSingle();
        role = profile?.role ?? "occupant";
      }
      signOut = async () => {
        "use server";
        const s = await createSupabaseServerClient();
        if (s) await s.auth.signOut();
        redirect("/login");
      };
    } catch {
      // keep default role on error
    }
  }
  // If env vars are missing, the redirects won't fire and we render with default role
  // Render the shell. When env is missing, role remains safe default.
  return (
    <div className="min-h-screen flex">
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-1">
            <div className="font-semibold">Dormy</div>
            <div className="text-xs text-muted-foreground">Role: {role}</div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Operations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                { /* Overview visible to all */ }
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/dashboard">Overview</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                { /* Occupants */}
                {role === "admin" || role === "student_assistant" ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/dashboard/occupants">Occupants</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                { /* Fines */}
                {role === "admin" || role === "student_assistant" ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/dashboard/fines">Fines</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                { /* Payments */}
                {role === "admin" || role === "treasurer" ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/dashboard/payments">Payments</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                { /* Events */}
                {role === "admin" || role === "student_assistant" || role === "treasurer" ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/dashboard/events">Events</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                { /* Evaluations */}
                {role === "admin" || role === "student_assistant" || role === "occupant" ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/dashboard/evaluations">Evaluations</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                { /* AI (admin only) */ }
                {role === "admin" ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/dashboard/ai">AI Organizer</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          {hasUser && signOut ? (
            <form action={signOut} className="p-2">
              <Button type="submit" variant="secondary" className="w-full">
                Sign out
              </Button>
            </form>
          ) : null}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <main className="flex-1 p-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
