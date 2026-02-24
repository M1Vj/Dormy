"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOccupant } from "@/app/actions/occupants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Occupant = {
  id: string;
  user_id?: string | null;
  full_name: string;
  student_id?: string | null;
  course?: string | null;
  status?: string | null;
  home_address?: string | null;
  birthdate?: string | null;
  contact_mobile?: string | null;
  contact_email?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_mobile?: string | null;
  emergency_contact_relationship?: string | null;
  role?: string;
  committee_memberships?: { committee_id: string; role: string; committee_name: string }[];
};

type CommitteeRef = {
  id: string;
  name: string;
};

export function EditOccupantForm({
  dormId,
  occupant,
  committees,
  showSystemAccess = true,
}: {
  dormId: string;
  occupant: Occupant;
  committees?: CommitteeRef[];
  showSystemAccess?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const primaryCommittee = occupant.committee_memberships?.[0];

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateOccupant(dormId, occupant.id, formData);
      if (result.error) {
        alert(result.error); // Fallback
      } else {
        router.push(`/admin/occupants/${occupant.id}`); // Exit edit mode
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <label
            htmlFor="full_name"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Full name
          </label>
          <Input id="full_name" name="full_name" defaultValue={occupant.full_name} required />
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="student_id"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Student ID
          </label>
          <Input id="student_id" name="student_id" defaultValue={occupant.student_id ?? ""} />
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="course"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Course
          </label>
          <Input
            id="course"
            name="course"
            defaultValue={occupant.course ?? ""}
            placeholder="e.g. BS Computer Science"
          />
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="contact_email"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Email
          </label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            autoComplete="email"
            defaultValue={occupant.contact_email ?? ""}
          />
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="contact_mobile"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Mobile number
          </label>
          <Input
            id="contact_mobile"
            name="contact_mobile"
            type="tel"
            autoComplete="tel"
            defaultValue={occupant.contact_mobile ?? ""}
          />
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="birthdate"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Birthdate
          </label>
          <Input
            id="birthdate"
            name="birthdate"
            type="date"
            defaultValue={occupant.birthdate ?? ""}
          />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <label
            htmlFor="home_address"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Home address
          </label>
          <Textarea id="home_address" name="home_address" defaultValue={occupant.home_address ?? ""} />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <p className="text-sm font-medium leading-none">Emergency contact</p>
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="emergency_contact_name"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Name
          </label>
          <Input
            id="emergency_contact_name"
            name="emergency_contact_name"
            defaultValue={occupant.emergency_contact_name ?? ""}
          />
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="emergency_contact_mobile"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Mobile number
          </label>
          <Input
            id="emergency_contact_mobile"
            name="emergency_contact_mobile"
            type="tel"
            defaultValue={occupant.emergency_contact_mobile ?? ""}
          />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <label
            htmlFor="emergency_contact_relationship"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Relationship
          </label>
          <Input
            id="emergency_contact_relationship"
            name="emergency_contact_relationship"
            defaultValue={occupant.emergency_contact_relationship ?? ""}
          />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <label
            htmlFor="status"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Status
          </label>
          <select
            name="status"
            defaultValue={occupant.status ?? "active"}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          >
            <option value="active">Active</option>
            <option value="left">Left</option>
            <option value="removed">Removed</option>
          </select>
        </div>

        {showSystemAccess && (
          <div className="mt-4 grid gap-4 sm:col-span-2">
            <h3 className="text-lg font-medium leading-none">System Access</h3>
            {!occupant.user_id ? (
              <div className="rounded-md border p-4 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10">
                System access cannot be provisioned until this occupant registers their account.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 rounded-md border p-4 bg-muted/30">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">App Role</label>
                  <select
                    name="role"
                    defaultValue={occupant.role ?? "occupant"}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="admin">Admin</option>
                    <option value="student_assistant">Student Assistant</option>
                    <option value="treasurer">Treasurer</option>
                    <option value="adviser">Adviser</option>
                    <option value="assistant_adviser">Assistant Adviser</option>
                    <option value="officer">Officer</option>
                    <option value="occupant">Occupant</option>
                  </select>
                </div>

                {committees && committees.length > 0 && (
                  <>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium leading-none">Committee Assignment</label>
                      <select
                        name="committee_id"
                        defaultValue={primaryCommittee?.committee_id ?? ""}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">None</option>
                        {committees.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium leading-none">Committee Role</label>
                      <select
                        name="committee_role"
                        defaultValue={primaryCommittee?.role ?? ""}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">-</option>
                        <option value="head">Head</option>
                        <option value="co-head">Co-Head</option>
                        <option value="member">Member</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          isLoading={isPending}
          onClick={() => router.push(`/admin/occupants/${occupant.id}`)}
        >
          Cancel
        </Button>
        <Button type="submit" isLoading={isPending}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}
