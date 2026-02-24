"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2 } from "lucide-react";

import { createSemester, updateSemester, deleteSemester } from "@/app/actions/semesters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DormSemester } from "@/lib/semesters";

type ActiveOccupant = {
  id: string;
  full_name: string;
  student_id: string | null;
  course: string | null;
};

type SemesterManagementProps = {
  dormId: string | null;
  activeSemester: DormSemester | null;
  semesters: DormSemester[];
  activeOccupants: ActiveOccupant[];
  outstandingMoney: {
    total: number;
    byLedger: {
      maintenance_fee: number;
      sa_fines: number;
      contributions: number;
    };
  };
  hideFinance?: boolean;
};

function generateSchoolYears(aroundYear: number = new Date().getFullYear(), range: number = 2) {
  const years = [];
  for (let i = -range; i <= range; i++) {
    const start = aroundYear + i;
    years.push(`${start}-${start + 1}`);
  }
  return years;
}

export function SemesterManagement({
  dormId,
  activeSemester,
  semesters,
  activeOccupants,
  outstandingMoney,
  hideFinance,
}: SemesterManagementProps) {
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [editingSemester, setEditingSemester] = useState<DormSemester | null>(null);
  const [deletingSemester, setDeletingSemester] = useState<DormSemester | null>(null);

  // Form values for Add/Edit
  const [formValues, setFormValues] = useState({
    title: "1st",
    schoolYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  });

  const schoolYears = useMemo(() => generateSchoolYears(new Date().getFullYear(), 2), []);

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const label = `${formData.get("school_year")} ${formData.get("semester")} Semester`;
    formData.set("label", label);

    startTransition(async () => {
      const result = await createSemester(dormId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Semester created successfully.");
      setIsAddOpen(false);
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const label = `${formData.get("school_year")} ${formData.get("semester")} Semester`;
    formData.set("label", label);

    startTransition(async () => {
      const result = await updateSemester(dormId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Semester updated successfully.");
      setEditingSemester(null);
    });
  };

  const handleDelete = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await deleteSemester(dormId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Semester deleted successfully.");
      setDeletingSemester(null);
    });
  };

  const getStatusBadge = (semester: DormSemester) => {
    const today = new Date().toISOString().split("T")[0];
    if (activeSemester?.id === semester.id) {
      return <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Active</span>;
    }
    if (semester.ends_on < today) {
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-800">Archived</span>;
    }
    return <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">Future</span>;
  };

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${hideFinance ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active semester</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{activeSemester?.label ?? "No active semester"}</p>
            {activeSemester ? (
              <p className="text-xs text-muted-foreground">
                {activeSemester.starts_on} to {activeSemester.ends_on}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Based on current date</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active occupants</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{activeOccupants.length}</p>
            <p className="text-xs text-muted-foreground">Persistent roster</p>
          </CardContent>
        </Card>
        {!hideFinance && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Outstanding money</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">₱{outstandingMoney.total.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Persists across semesters</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Semesters</CardTitle>
            <CardDescription>Manage your dorm semesters. Archiving happens automatically based on dates.</CardDescription>
          </div>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Semester
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Add New Semester</DialogTitle>
                  <DialogDescription>Define the dates and details for the semester.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Title</label>
                    <Select name="semester" value={formValues.title} onValueChange={(val) => setFormValues(prev => ({ ...prev, title: val }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select title" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1st">1st</SelectItem>
                        <SelectItem value="2nd">2nd</SelectItem>
                        <SelectItem value="Midyear">Midyear</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">School Year</label>
                    <Select name="school_year" value={formValues.schoolYear} onValueChange={(val) => setFormValues(prev => ({ ...prev, schoolYear: val }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select school year" />
                      </SelectTrigger>
                      <SelectContent>
                        {schoolYears.map(year => (
                          <SelectItem key={year} value={year}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium" htmlFor="starts_on">Starts on</label>
                      <Input id="starts_on" name="starts_on" type="date" required />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium" htmlFor="ends_on">Ends on</label>
                      <Input id="ends_on" name="ends_on" type="date" required />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Saving..." : "Save Semester"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted bg-opacity-50">
                <tr className="border-b text-left">
                  <th className="px-4 py-3 font-medium">School Year</th>
                  <th className="px-4 py-3 font-medium">Semester</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {semesters.map((semester) => (
                  <tr key={semester.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{semester.school_year}</td>
                    <td className="px-4 py-3">{semester.semester}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {semester.starts_on} to {semester.ends_on}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(semester)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary"
                          onClick={() => {
                            setEditingSemester(semester);
                            setFormValues({ title: semester.semester, schoolYear: semester.school_year });
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeletingSemester(semester)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!semesters.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No semesters found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingSemester} onOpenChange={(open) => !open && setEditingSemester(null)}>
        <DialogContent>
          <form onSubmit={handleUpdate}>
            <input type="hidden" name="id" value={editingSemester?.id ?? ""} />
            <DialogHeader>
              <DialogTitle>Edit Semester</DialogTitle>
              <DialogDescription>Update details for {editingSemester?.label}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Title</label>
                <Select name="semester" value={formValues.title} onValueChange={(val) => setFormValues(prev => ({ ...prev, title: val }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select title" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1st">1st</SelectItem>
                    <SelectItem value="2nd">2nd</SelectItem>
                    <SelectItem value="Midyear">Midyear</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">School Year</label>
                <Select name="school_year" value={formValues.schoolYear} onValueChange={(val) => setFormValues(prev => ({ ...prev, schoolYear: val }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select school year" />
                  </SelectTrigger>
                  <SelectContent>
                    {schoolYears.map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="edit_starts_on">Starts on</label>
                  <Input id="edit_starts_on" name="starts_on" type="date" defaultValue={editingSemester?.starts_on} required />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="edit_ends_on">Ends on</label>
                  <Input id="edit_ends_on" name="ends_on" type="date" defaultValue={editingSemester?.ends_on} required />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingSemester(null)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingSemester} onOpenChange={(open) => !open && setDeletingSemester(null)}>
        <DialogContent>
          <form onSubmit={handleDelete}>
            <input type="hidden" name="id" value={deletingSemester?.id ?? ""} />
            <DialogHeader>
              <DialogTitle>Delete Semester</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the semester <span className="font-semibold text-foreground">{deletingSemester?.label}</span>?
                This action cannot be undone. It will only succeed if there are no records (events, fines, etc.) tied to this semester.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDeletingSemester(null)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending ? "Deleting..." : "Delete Semester"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
