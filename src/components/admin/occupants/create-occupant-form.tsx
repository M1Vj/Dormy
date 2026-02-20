"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CreateOccupantResult = {
  error?: string;
  success?: boolean;
};

const initialState = { error: "", success: false };

export function CreateOccupantForm({
  action,
}: {
  action: (formData: FormData) => Promise<CreateOccupantResult>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_previousState: typeof initialState, formData: FormData) => {
      const result = await action(formData);
      if (result?.error) {
        return { error: result.error, success: false };
      }
      setOpen(false); // Close dialog on success
      return { error: "", success: true };
    },
    initialState
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Occupant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Occupant</DialogTitle>
          <DialogDescription>
            Manually add an occupant to the system without requiring them to sign up through the app. Fill in their details below.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="full_name">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input id="full_name" name="full_name" required placeholder="Juan Dela Cruz" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="student_id">
                Student ID
              </label>
              <Input id="student_id" name="student_id" placeholder="202X-XXXXX" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="course">
                Course
              </label>
              <Input id="course" name="course" placeholder="BS Computer Science" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="joined_at">
                Joined Date
              </label>
              <Input id="joined_at" name="joined_at" type="date" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="birthdate">
                Birthdate
              </label>
              <Input id="birthdate" name="birthdate" type="date" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="home_address">
              Home Address
            </label>
            <Input id="home_address" name="home_address" placeholder="123 Mabuhay St, Barangay, City, Province" />
          </div>

          <div className="mt-4 border-t pt-4">
            <h4 className="mb-4 text-sm font-medium text-foreground">Contact Information</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="contact_mobile">
                  Mobile Number
                </label>
                <Input id="contact_mobile" name="contact_mobile" placeholder="09XX-XXX-XXXX" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="contact_email">
                  Email Address
                </label>
                <Input id="contact_email" name="contact_email" type="email" placeholder="email@example.com" />
              </div>
            </div>
          </div>

          <div className="mt-4 border-t pt-4">
            <h4 className="mb-4 text-sm font-medium text-foreground">Emergency Contact</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="emergency_contact_name">
                  Contact Name
                </label>
                <Input id="emergency_contact_name" name="emergency_contact_name" placeholder="Maria Dela Cruz" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="emergency_contact_relationship">
                  Relationship
                </label>
                <Input id="emergency_contact_relationship" name="emergency_contact_relationship" placeholder="Mother" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="emergency_contact_mobile">
                  Contact Mobile Number
                </label>
                <Input id="emergency_contact_mobile" name="emergency_contact_mobile" placeholder="09XX-XXX-XXXX" />
              </div>
            </div>
          </div>

          {state.error && (
            <p className="w-full text-sm font-medium text-destructive">{state.error}</p>
          )}

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending}>
              Save Occupant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
