"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { upsertFacultyProfile } from "@/app/actions/dorm";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const facultySchema = z.object({
  faculty_id: z.string().min(1, "Faculty ID is required"),
  department: z.string().min(1, "Department is required"),
  position: z.string().min(1, "Position is required"),
  specialization: z.string().optional(),
  bio: z.string().optional(),
});

type FacultyFormValues = z.infer<typeof facultySchema>;

export function FacultyProfileForm({ initialData }: { initialData?: Partial<FacultyFormValues> }) {
  const form = useForm<FacultyFormValues>({
    resolver: zodResolver(facultySchema),
    defaultValues: {
      faculty_id: initialData?.faculty_id || "",
      department: initialData?.department || "",
      position: initialData?.position || "",
      specialization: initialData?.specialization || "",
      bio: initialData?.bio || "",
    },
  });

  async function onSubmit(data: FacultyFormValues) {
    const result = await upsertFacultyProfile(data);
    if (result.success) {
      toast.success("Faculty profile updated successfully.");
    } else {
      toast.error(result.error || "Failed to update faculty profile.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faculty Details</CardTitle>
        <CardDescription>Update your professional and academic information.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="faculty_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Faculty ID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 2023-FAC-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Associate Professor" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. College of Engineering" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="specialization"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Specialization</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Software Systems, AI" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Briefly describe your background and role..."
                      className="resize-none h-24"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full">Save Changes</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
