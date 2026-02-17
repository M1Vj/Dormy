"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Users } from "lucide-react";

import { deleteCommittee } from "@/app/actions/committees";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

interface CommitteeMember {
  role: string;
  user_id: string;
  display_name: string | null;
}

interface Committee {
  id: string;
  name: string;
  description: string | null;
  members: CommitteeMember[];
}

export function CommitteeCard({ committee }: { committee: Committee }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const head = committee.members.find((m) => m.role === "head");
  const coHeads = committee.members.filter((m) => m.role === "co-head");
  const memberCount = committee.members.length;

  const handleDelete = () => {
    startTransition(async () => {
      await deleteCommittee(committee.id);
      router.refresh();
    });
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle>{committee.name}</CardTitle>
            <CardDescription className="line-clamp-2 min-h-[2.5rem]">
              {committee.description || "No description provided."}
            </CardDescription>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Committee?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the <strong>{committee.name}</strong> committee and all its member assignments.
                  Expenses and events will remain but will be unlinked.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                  {isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold w-16">Head:</span>
            {head ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {(head.display_name ?? "U").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span>{head.display_name ?? "Unknown"}</span>
              </div>
            ) : (
              <span className="text-muted-foreground italic">None assigned</span>
            )}
          </div>
          <div className="flex items-start gap-2 text-sm">
            <span className="font-semibold w-16 pt-0.5">Co-Head:</span>
            {coHeads.length > 0 ? (
              <div className="flex flex-col gap-1">
                {coHeads.map((ch) => (
                  <span key={ch.user_id}>{ch.display_name ?? "Unknown"}</span>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground italic">None assigned</span>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex items-center text-sm text-muted-foreground">
            <Users className="mr-2 h-4 w-4" />
            {memberCount} members
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/committees/${committee.id}`}>Open</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
