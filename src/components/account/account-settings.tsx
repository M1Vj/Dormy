"use client";

import { useMemo, useState } from "react";
import { Chrome, KeyRound, Link2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import { useDorm } from "@/components/providers/dorm-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getRoleLabel } from "@/lib/roles";

const MIN_PASSWORD_LENGTH = 10;

export function AccountSettings() {
  const { user, actualRoles, role, setActiveRole, dormId, refresh, isLoading } = useAuth();
  const { activeDorm } = useDorm();
  const [supabase] = useState(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  });

  const hasGoogleIdentity = useMemo(() => {
    const identities = user?.identities ?? [];
    return identities.some((identity) => identity.provider === "google");
  }, [user]);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "User";
  const email = user?.email ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);

  const [linkPending, setLinkPending] = useState(false);

  const [inlineError, setInlineError] = useState("");

  const onLinkGoogle = async () => {
    if (!supabase) {
      toast.error("Supabase env is not configured.");
      return;
    }
    if (!user) {
      toast.error("You must be signed in to link an account.");
      return;
    }
    if (hasGoogleIdentity) {
      toast.message("Google is already linked for this account.");
      return;
    }

    setInlineError("");
    setLinkPending(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings")}`;
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to link Google account.";
      setInlineError(message);
      toast.error(message);
      setLinkPending(false);
    }
  };

  const onUpdatePassword = async () => {
    if (!supabase) {
      toast.error("Supabase env is not configured.");
      return;
    }
    if (!user) {
      toast.error("You must be signed in to change your password.");
      return;
    }

    const nextPassword = newPassword.trim();
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      const message = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      setInlineError(message);
      toast.error(message);
      return;
    }

    if (nextPassword !== confirmPassword.trim()) {
      const message = "Passwords do not match.";
      setInlineError(message);
      toast.error(message);
      return;
    }

    setInlineError("");
    setPasswordPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update password.";
      setInlineError(message);
      toast.error(message);
    } finally {
      setPasswordPending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account security and connected sign-in methods.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            Signed in as <span className="font-medium text-foreground">{displayName}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-medium">{email || "Unknown"}</p>
          </div>
          <div className="space-y-2 sm:col-span-2 border-t pt-4 mt-2">
            <p className="text-xs text-muted-foreground">Active Roles</p>
            <div className="flex flex-wrap gap-2">
              {actualRoles.length > 0 ? (
                actualRoles.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={r === role ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveRole(r)}
                  >
                    {getRoleLabel(r)}
                  </Button>
                ))
              ) : (
                <p className="text-sm font-medium text-muted-foreground">Unassigned</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Click a role button above to switch your active view and permissions for this session.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Dorm</p>
            <p className="text-sm font-medium">
              {activeDorm?.name ?? (dormId ? "Selected dorm" : "No dorm selected")}
            </p>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              disabled={isLoading}
              onClick={() => refresh()}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {isLoading ? "Refreshing…" : "Refresh access"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            Connected accounts
          </CardTitle>
          <CardDescription>
            Link Google to avoid duplicate accounts and use one email everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted-foreground">
                {hasGoogleIdentity
                  ? "Linked"
                  : "Not linked yet. Linking is recommended if you were provisioned with a temporary password."}
              </p>
            </div>
            <Button
              type="button"
              variant={hasGoogleIdentity ? "secondary" : "outline"}
              disabled={linkPending || hasGoogleIdentity}
              onClick={onLinkGoogle}
              className="sm:w-auto"
            >
              <Chrome className="mr-2 h-4 w-4" />
              {hasGoogleIdentity ? "Linked" : linkPending ? "Connecting…" : "Link Google"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Password
          </CardTitle>
          <CardDescription>
            Update the password for this account. If you sign in with Google, you may not need a password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          {inlineError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {inlineError}
            </div>
          ) : null}
          <Button
            type="button"
            onClick={onUpdatePassword}
            disabled={passwordPending}
            className="w-full sm:w-auto"
          >
            {passwordPending ? "Saving…" : "Update password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

