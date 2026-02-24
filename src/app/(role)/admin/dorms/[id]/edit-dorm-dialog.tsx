"use client";

import { useTransition, useState } from "react";
import { Edit2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateDorm } from "@/app/actions/dorm";
import { toast } from "sonner";

type Dorm = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
};

export function EditDormDialog({ dorm }: { dorm: Dorm }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateDorm(dorm.id, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Dormitory updated successfully.");
        setIsOpen(false);
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit2 className="mr-2 h-4 w-4" />
          Edit Details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Dormitory</DialogTitle>
            <DialogDescription>
              Update the core details of this dormitory.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Dorm Name
              </label>
              <Input
                id="name"
                name="name"
                defaultValue={dorm.name}
                placeholder="e.g. Molave Residence Hall"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="slug">
                Slug (URL Identifier)
              </label>
              <Input
                id="slug"
                name="slug"
                defaultValue={dorm.slug}
                placeholder="e.g. molave-hall"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="description">
                Description
              </label>
              <Textarea
                id="description"
                name="description"
                defaultValue={dorm.description ?? ""}
                placeholder="A brief description of the dormitory..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="capacity">
                  Capacity
                </label>
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  defaultValue={dorm.capacity ?? ""}
                  placeholder="100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="address">
                  Address
                </label>
                <Input
                  id="address"
                  name="address"
                  defaultValue={dorm.address ?? ""}
                  placeholder="Campus St."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
