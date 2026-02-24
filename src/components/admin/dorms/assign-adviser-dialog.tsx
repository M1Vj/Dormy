"use client";

import { useState } from "react";
import { UserPlus, Loader2, Mail, GraduationCap, Briefcase, BookOpen, FileText, Hash } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { findUserByEmail, assignDormPersonnel, upsertFacultyProfile } from "@/app/actions/dorm";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type FacultyDetails = {
  department: string;
  position: string;
  specialization: string;
  bio: string;
  faculty_id: string;
};

export function AssignAdviserDialog({
  dormId,
  onAssigned
}: {
  dormId: string;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [foundUser, setFoundUser] = useState<any>(null);
  const [assigning, setAssigning] = useState(false);
  const [facultyDetails, setFacultyDetails] = useState<FacultyDetails>({
    department: "",
    position: "",
    specialization: "",
    bio: "",
    faculty_id: "",
  });

  function resetState() {
    setEmail("");
    setFoundUser(null);
    setFacultyDetails({ department: "", position: "", specialization: "", bio: "", faculty_id: "" });
  }

  async function handleSearch() {
    if (!email) return;
    setLoading(true);
    setFoundUser(null);
    const result = await findUserByEmail(email);
    if ("error" in result) {
      toast.error(result.error || "Search failed.");
    } else if (result.user) {
      setFoundUser(result.user);
    } else {
      toast.error("No user found with that email. Make sure they have registered an account.");
    }
    setLoading(false);
  }

  async function handleAssign() {
    if (!foundUser) return;
    setAssigning(true);

    // First, save faculty profile details
    const profileResult = await upsertFacultyProfile({
      targetUserId: foundUser.user_id,
      department: facultyDetails.department || undefined,
      position: facultyDetails.position || undefined,
      specialization: facultyDetails.specialization || undefined,
      bio: facultyDetails.bio || undefined,
      faculty_id: facultyDetails.faculty_id || undefined,
    });

    if (profileResult.error) {
      toast.error(profileResult.error);
      setAssigning(false);
      return;
    }

    // Then, assign to dorm
    const result = await assignDormPersonnel(dormId, foundUser.user_id, "adviser");
    if (result.success) {
      toast.success("Adviser assigned successfully.");
      setOpen(false);
      resetState();
      onAssigned();
    } else {
      toast.error(result.error || "Assignment failed.");
    }
    setAssigning(false);
  }

  function updateField(field: keyof FacultyDetails, value: string) {
    setFacultyDetails(prev => ({ ...prev, [field]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          <UserPlus className="h-3.5 w-3.5" />
          Assign Adviser
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Dorm Adviser</DialogTitle>
          <DialogDescription>
            Search for a faculty member by email, then fill in their details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Step 1: Email Search */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Find Faculty Member
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="faculty@example.com"
                  className="pl-8"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={loading} variant="secondary">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
              </Button>
            </div>
          </div>

          {/* Step 2: User found — show profile and faculty details form */}
          {foundUser && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-amber-100 text-amber-700 font-bold">
                    {foundUser.display_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{foundUser.display_name}</p>
                  <p className="text-xs text-muted-foreground">{email}</p>
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Faculty Details
                </Label>

                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="adv_department" className="text-sm flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                      Department
                    </Label>
                    <Input
                      id="adv_department"
                      placeholder="e.g., College of Engineering"
                      value={facultyDetails.department}
                      onChange={(e) => updateField("department", e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="adv_position" className="text-sm flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        Position
                      </Label>
                      <Input
                        id="adv_position"
                        placeholder="e.g., Associate Professor"
                        value={facultyDetails.position}
                        onChange={(e) => updateField("position", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="adv_faculty_id" className="text-sm flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        Faculty ID
                      </Label>
                      <Input
                        id="adv_faculty_id"
                        placeholder="e.g., FAC-2024-001"
                        value={facultyDetails.faculty_id}
                        onChange={(e) => updateField("faculty_id", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="adv_specialization" className="text-sm flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      Specialization
                    </Label>
                    <Input
                      id="adv_specialization"
                      placeholder="e.g., Structural Engineering, etc."
                      value={facultyDetails.specialization}
                      onChange={(e) => updateField("specialization", e.target.value)}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="adv_bio" className="text-sm flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      Bio
                    </Label>
                    <Textarea
                      id="adv_bio"
                      placeholder="A short bio or description of the adviser..."
                      rows={3}
                      className="resize-none"
                      value={facultyDetails.bio}
                      onChange={(e) => updateField("bio", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {foundUser && (
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { setOpen(false); resetState(); }}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={assigning}>
              {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {assigning ? "Assigning..." : "Assign as Adviser"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

