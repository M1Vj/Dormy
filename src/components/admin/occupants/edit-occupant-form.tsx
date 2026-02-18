"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOccupant } from "@/app/actions/occupants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Occupant = {
  id: string;
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
};

export function EditOccupantForm({
  dormId,
  occupant,
}: {
  dormId: string;
  occupant: Occupant;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.push(`/admin/occupants/${occupant.id}`)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
