"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/providers/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getPersonalOccupant, updatePersonalOccupant } from "@/app/actions/occupants";

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

  // Occupant fields
  const [occupant, setOccupant] = useState<Record<string, unknown> | null>(null);
  const [studentId, setStudentId] = useState("");
  const [course, setCourse] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyMobile, setEmergencyMobile] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingOccupant, setSavingOccupant] = useState(false);

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

      // Load occupant data
      try {
        const occData = await getPersonalOccupant();
        if (occData && mounted) {
          setOccupant(occData);
          setStudentId(occData.student_id ?? "");
          setCourse(occData.course ?? "");
          setContactMobile(occData.contact_mobile ?? "");
          setHomeAddress(occData.home_address ?? "");
          setBirthdate(occData.birthdate ?? "");
          setEmergencyName(occData.emergency_contact_name ?? "");
          setEmergencyMobile(occData.emergency_contact_mobile ?? "");
          setEmergencyRelation(occData.emergency_contact_relationship ?? "");
        }
      } catch (err) {
        console.error("Failed to load occupant data:", err);
      }

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

  const onSaveOccupant = async () => {
    setSavingOccupant(true);
    try {
      const formData = new FormData();
      formData.append("student_id", studentId);
      formData.append("course", course);
      formData.append("contact_mobile", contactMobile);
      formData.append("home_address", homeAddress);
      formData.append("birthdate", birthdate);
      formData.append("emergency_contact_name", emergencyName);
      formData.append("emergency_contact_mobile", emergencyMobile);
      formData.append("emergency_contact_relationship", emergencyRelation);

      const result = await updatePersonalOccupant(formData);
      if (result.error) throw new Error(result.error);

      toast.success("Occupant details updated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update occupant details.";
      toast.error(message);
    } finally {
      setSavingOccupant(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Profile Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account profile and occupant details.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Account Profile</CardTitle>
              <CardDescription>
                {loading ? "Loading your profile…" : "Publicly visible info across the platform."}
              </CardDescription>
            </div>
            <Button
              type="button"
              onClick={onSave}
              disabled={saving || loading || !profile}
              size="sm"
            >
              {saving ? "Saving…" : "Update Profile"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="avatarUrl">Avatar URL</Label>
              <Input
                id="avatarUrl"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://…"
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {occupant && (
        <Card className="overflow-hidden border-primary/20 shadow-lg transition-all hover:shadow-xl">
          <CardHeader className="bg-primary/5 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">Occupant Details</CardTitle>
                <CardDescription>
                  Your official dorm information.
                </CardDescription>
              </div>
              <Button
                type="button"
                onClick={onSaveOccupant}
                disabled={savingOccupant || loading}
                size="sm"
                className="bg-primary hover:bg-primary/90"
              >
                {savingOccupant ? "Saving…" : "Save Details"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="studentId" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Student ID</Label>
                <Input
                  id="studentId"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="20XX-XXXXX"
                  className="bg-background/50 focus:bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="course" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Course / Classification</Label>
                <Input
                  id="course"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="BSCS"
                  className="bg-background/50 focus:bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactMobile" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mobile Number</Label>
                <Input
                  id="contactMobile"
                  value={contactMobile}
                  onChange={(e) => setContactMobile(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  className="bg-background/50 focus:bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthdate" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Birthdate</Label>
                <Input
                  id="birthdate"
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className="bg-background/50 focus:bg-background"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="homeAddress" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Home Address</Label>
              <Input
                id="homeAddress"
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="Brgy. 123, City, Province"
                className="bg-background/50 focus:bg-background"
              />
            </div>

            <Separator className="my-2" />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-primary/80">Emergency Contact</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="emergencyName" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact Name</Label>
                  <Input
                    id="emergencyName"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="Full Name"
                    className="bg-background/50 focus:bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyMobile" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact Mobile</Label>
                  <Input
                    id="emergencyMobile"
                    value={emergencyMobile}
                    onChange={(e) => setEmergencyMobile(e.target.value)}
                    placeholder="09XXXXXXXXX"
                    className="bg-background/50 focus:bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyRelation" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Relationship</Label>
                  <Input
                    id="emergencyRelation"
                    value={emergencyRelation}
                    onChange={(e) => setEmergencyRelation(e.target.value)}
                    placeholder="Parent / Guardian"
                    className="bg-background/50 focus:bg-background"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
