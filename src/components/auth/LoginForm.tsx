"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chrome } from "lucide-react";
import { toast } from "sonner";

export function LoginForm() {
  const router = useRouter();
  const [supabase] = useState(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  async function onGoogleSignIn() {
    if (!supabase) {
      toast.error("Supabase env is not configured. Copy .env.example → .env.local and set keys.");
      return;
    }

    setOauthLoading(true);
    try {
      const currentUrl = new URL(window.location.href);
      const nextPath = currentUrl.searchParams.get("next") || "/home";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to start Google sign-in";
      toast.error(message);
      setOauthLoading(false);
    }
  }

  async function onSubmit(formData: FormData) {
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!supabase) {
      toast.error("Supabase env is not configured. Copy .env.example → .env.local and set keys.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in");
      router.push("/occupant/home");
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to sign in";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={oauthLoading}
        onClick={onGoogleSignIn}
      >
        <Chrome className="mr-2 h-4 w-4" />
        {oauthLoading ? "Connecting…" : "Continue with Google"}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full" isLoading={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Admin tip: provision accounts in Admin → Users, then assign a dorm role.
        </p>
      </form>
    </div>
  );
}
