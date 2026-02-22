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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { updateMembershipRole } from "@/app/actions/memberships";
import { AppRole, getRoleLabel } from "@/lib/roles";

interface UpdateRoleDialogProps {
  dormId: string;
  userId: string;
  occupantName: string;
  currentRole: AppRole;
  triggerClassName?: string;
  showLabel?: boolean;
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
  currentRole,
  triggerClassName,
  showLabel,
}: UpdateRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AppRole>(currentRole);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      const result = await updateMembershipRole(dormId, userId, role);
      if (result.success) {
        toast.success(`Updated ${occupantName}'s role to ${getRoleLabel(role)}`);
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
        <Button
          variant="ghost"
          size="sm"
          className={triggerClassName ?? "h-8 w-8 p-0"}
        >
          <ShieldCheck className={`h-4 w-4 ${showLabel ? "mr-2" : ""}`} />
          {showLabel ? "Update role" : <span className="sr-only">Update role</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Role</DialogTitle>
          <DialogDescription>
            Change the administrative role for <strong>{occupantName}</strong>.
            This defines their permissions within the dorm.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Select Role</label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as AppRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {getRoleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={isLoading || role === currentRole}>
            {isLoading ? "Updating..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
