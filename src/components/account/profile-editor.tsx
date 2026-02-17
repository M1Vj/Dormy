"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function ProfileEditor() {
  const { user } = useAuth();
  const [supabase] = useState(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  });

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      if (!supabase || !user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        const { data: created, error: insertError } = await supabase
          .from("profiles")
          .insert({ user_id: user.id })
          .select("user_id, display_name, avatar_url")
          .single();

        if (!mounted) return;

        if (insertError) {
          toast.error(insertError.message);
          setLoading(false);
          return;
        }

        setProfile(created as ProfileRow);
        setDisplayName((created?.display_name ?? "") as string);
        setAvatarUrl((created?.avatar_url ?? "") as string);
        setLoading(false);
        return;
      }

      setProfile(data as ProfileRow);
      setDisplayName((data.display_name ?? "") as string);
      setAvatarUrl((data.avatar_url ?? "") as string);
      setLoading(false);
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [supabase, user]);

  const onSave = async () => {
    if (!supabase) {
      toast.error("Supabase env is not configured.");
      return;
    }
    if (!user) {
      toast.error("You must be signed in to update your profile.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq("user_id", user.id);

      if (error) throw error;
      toast.success("Profile updated");
      setProfile((current) =>
        current
          ? {
              ...current,
              display_name: displayName.trim() || null,
              avatar_url: avatarUrl.trim() || null,
            }
          : current
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update profile.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Update your display name and avatar for staff review and dorm workflows.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base">Profile details</CardTitle>
          <CardDescription>
            {loading ? "Loading your profile…" : "Your profile is stored per account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Example: Your name"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Avatar URL (optional)</Label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://…"
              disabled={loading}
            />
          </div>
          <Button type="button" onClick={onSave} disabled={saving || loading || !profile}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
