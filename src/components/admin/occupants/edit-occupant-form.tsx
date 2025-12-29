"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOccupant } from "@/app/actions/occupants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EditOccupantForm({
  dormId,
  occupant,
}: {
  dormId: string;
  occupant: any;
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
      <div className="grid gap-2">
        <label htmlFor="full_name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Full Name</label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={occupant.full_name}
          required
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="student_id" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Student ID</label>
        <Input
          id="student_id"
          name="student_id"
          defaultValue={occupant.student_id}
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="classification" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Classification</label>
        <Input
          id="classification"
          name="classification"
          defaultValue={occupant.classification}
          placeholder="e.g. 1st Year, Senior"
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="status" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Status</label>
        <select
          name="status"
          defaultValue={occupant.status}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        >
          <option value="active">Active</option>
          <option value="left">Left</option>
          <option value="removed">Removed</option>
        </select>
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
