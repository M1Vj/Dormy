import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Users, ClipboardCheck, Info, MapPin, Building } from "lucide-react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDormPersonnel, getDorm } from "@/app/actions/dorm";
import { DormPersonnel } from "@/components/admin/dorms/dorm-personnel";
import { getOccupants, createOccupant } from "@/app/actions/occupants";
import { OccupantTable } from "@/components/admin/occupants/occupant-table";
import { CreateOccupantForm } from "@/components/admin/occupants/create-occupant-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditDormDialog } from "./edit-dorm-dialog";

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
  room?: string | string[];
  level?: string | string[];
  tab?: string | string[];
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

export default async function DormDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const searchParamsValue = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dorm = await getDorm(id);
  if (!dorm || ("error" in dorm)) notFound();

  const search = normalizeParam(searchParamsValue?.search);
  const status = normalizeParam(searchParamsValue?.status);
  const room = normalizeParam(searchParamsValue?.room);
  const level = normalizeParam(searchParamsValue?.level);

  const trimmedSearch = search?.trim() || undefined;
  const trimmedStatus = status?.trim() || undefined;
  const trimmedRoom = room?.trim() || undefined;
  const trimmedLevel = level?.trim() || undefined;
  const tab = normalizeParam(searchParamsValue?.tab) || "management";

  const [personnel, occupants] = await Promise.all([
    getDormPersonnel(id),
    getOccupants(id, {
      search: trimmedSearch,
      status: trimmedStatus,
      room: trimmedRoom,
      level: trimmedLevel,
    }),
  ]);

  const { adviser, sa } = personnel;
  const createOccupantAction = createOccupant.bind(null, id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/dorms" className="hover:text-foreground">Dorms</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{dorm.name}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{dorm.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {dorm.address && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {dorm.address}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Building className="h-3.5 w-3.5" />
              Capacity: {dorm.capacity ?? "Not set"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EditDormDialog dorm={dorm as any} />
          <CreateOccupantForm action={createOccupantAction} />
          <Button asChild variant="outline">
            <Link href={`/admin/dorms/${id}/clearance`}>
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Clearance
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue={tab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="occupants">Occupants</TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="space-y-6 mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <DormPersonnel
                dormId={id}
                initialAdviser={adviser as any}
                initialSA={sa as any}
              />
              {dorm.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">About this Dormitory</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">
                    {dorm.description}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Info className="h-4 w-4 text-amber-500" />
                    Dorm Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Code:</span>
                    <span className="font-mono font-medium">{dorm.slug}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Created:</span>
                    <span>{new Date(dorm.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="text-emerald-600 font-medium">Active</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="occupants" className="mt-6">
          <OccupantTable
            dormId={id}
            occupants={occupants}
            role="admin"
            basePath={`/admin/dorms/${id}`}
            occupantBasePath="/admin/occupants"
            filters={{
              search: trimmedSearch,
              status: trimmedStatus,
              room: trimmedRoom,
              level: trimmedLevel,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
