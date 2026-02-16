"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      router.push("/home");
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to sign in";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Admin tip: create users in Supabase Auth, then set role/dorm_id in public.profiles.
      </p>
    </form>
  );
}
