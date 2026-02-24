"use client";

import { useState } from "react";
import { Star, GraduationCap, MapPin, Phone, Mail, Edit3 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssignAdviserDialog } from "./assign-adviser-dialog";
import { AssignSADialog } from "./assign-sa-dialog";
import { useRouter } from "next/navigation";

type Personnel = {
  role: string;
  user_id: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
    faculty_profiles: {
      department: string | null;
      position: string | null;
      specialization: string | null;
      bio: string | null;
      faculty_id: string | null;
    } | null;
  } | null;
} | null;

export function DormPersonnel({
  dormId,
  initialAdviser,
  initialSA
}: {
  dormId: string;
  initialAdviser: Personnel;
  initialSA: Personnel;
}) {
  const router = useRouter();
  const adviser = initialAdviser;
  const sa = initialSA;

  const onAssigned = () => {
    router.refresh();
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Adviser Card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 font-semibold">
              <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
              Dorm Adviser
            </CardTitle>
            <AssignAdviserDialog dormId={dormId} onAssigned={onAssigned} />
          </div>
          <CardDescription>Primary faculty supervisor for the dorm.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {adviser ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border-2 border-primary/10 ring-2 ring-background">
                  <AvatarImage src={adviser.profiles?.avatar_url || ""} />
                  <AvatarFallback className="bg-amber-100 text-amber-700 font-bold">
                    {adviser.profiles?.display_name?.charAt(0) || "A"}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="font-bold text-lg leading-none">{adviser.profiles?.display_name}</p>
                  <p className="text-sm text-amber-600 font-medium">{adviser.profiles?.faculty_profiles?.position || "Faculty Member"}</p>
                </div>
              </div>

              <div className="grid gap-2 text-sm pt-4 border-t">
                {adviser.profiles?.faculty_profiles ? (
                  <>
                    {adviser.profiles.faculty_profiles.department && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <GraduationCap className="h-4 w-4 shrink-0" />
                        <span className="truncate">{adviser.profiles.faculty_profiles.department}</span>
                      </div>
                    )}
                    {adviser.profiles.faculty_profiles.specialization && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Star className="h-4 w-4 shrink-0" />
                        <span className="truncate">{adviser.profiles.faculty_profiles.specialization}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded">
                    No faculty details provided yet.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-muted/30 text-center px-4">
              <Star className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">No adviser assigned</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Assign a faculty member to oversee this dormitory.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SA Card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 font-semibold">
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 px-1.5 py-0">SA</Badge>
              Student Assistant
            </CardTitle>
            <AssignSADialog dormId={dormId} onAssigned={onAssigned} />
          </div>
          <CardDescription>Student helper for dorm management.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {sa ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border-2 border-primary/10 ring-2 ring-background">
                  <AvatarImage src={sa.profiles?.avatar_url || ""} />
                  <AvatarFallback className="bg-emerald-100 text-emerald-700 font-bold">
                    {sa.profiles?.display_name?.charAt(0) || "S"}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="font-bold text-lg leading-none">{sa.profiles?.display_name}</p>
                  <p className="text-sm text-emerald-600 font-medium">Student Assistant</p>
                </div>
              </div>
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">Assigned from current occupants list.</p>
              </div>
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-muted/30 text-center px-4">
              <Badge variant="outline" className="h-8 w-8 rounded-full mb-2 flex items-center justify-center border-muted-foreground/30 text-muted-foreground/30">SA</Badge>
              <p className="text-sm font-medium text-muted-foreground">No SA assigned</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Pick an occupant to assist with dorm administration.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
