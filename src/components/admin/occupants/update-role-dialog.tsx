"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updateMembershipRoles } from "@/app/actions/memberships";
import { AppRole, getRoleLabel } from "@/lib/roles";

interface UpdateRoleDialogProps {
  dormId: string;
  userId?: string | null;
  occupantName: string;
  currentRoles: AppRole[];
}

const ROLES: AppRole[] = [
  "admin",
  "student_assistant",
  "treasurer",
  "adviser",
  "assistant_adviser",
  "officer",
  "occupant",
];

export function UpdateRoleDialog({
  dormId,
  userId,
  occupantName,
  currentRoles,
}: UpdateRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>(currentRoles);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdate = async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const result = await updateMembershipRoles(dormId, userId, roles);
      if (result.success) {
        toast.success(`Updated ${occupantName}'s roles`);
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to update role");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Update Role">
          <ShieldCheck className="h-4 w-4" />
          <span className="sr-only">Update role</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Role</DialogTitle>
          <DialogDescription>
            {userId
              ? `Change the administrative role for ${occupantName}. This defines their permissions within the dorm.`
              : `Cannot update role for ${occupantName}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {userId ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Select Roles</label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => {
                  const isSelected = roles.includes(r);
                  return (
                    <Button
                      key={r}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (isSelected) {
                          setRoles(roles.filter((selectedRole) => selectedRole !== r));
                        } else {
                          setRoles([...roles, r]);
                        }
                      }}
                    >
                      {getRoleLabel(r)}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-muted p-4 text-sm text-balance text-muted-foreground">
              This occupant has not yet registered an account on the application. They must sign up and join the dorm using the dorm code before they can be assigned an administrative role.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            {userId ? "Cancel" : "Close"}
          </Button>
          {userId && (
            <Button onClick={handleUpdate} isLoading={isLoading} disabled={isLoading || (roles.length === currentRoles.length && roles.every(r => currentRoles.includes(r)))}>
              Save changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
