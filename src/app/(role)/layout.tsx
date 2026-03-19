
import { cookies } from "next/headers";
import type { AppRole } from "@/lib/roles";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/nav/app-sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { HeaderRoleChip } from "@/components/nav/header-role-chip"
import { HeaderLogo } from "@/components/nav/header-logo"
import { RouteProgress } from "@/components/nav/route-progress"
import { RoleSubpageBackButton } from "@/components/nav/role-subpage-back-button"
import { UserNav } from "@/components/nav/user-nav"
import { AuthProvider } from "@/components/providers/auth-provider"
import { DormProvider } from "@/components/providers/dorm-provider"
import { getActiveDormId, getUserDorms } from "@/lib/dorms"
import { getCachedRolesForDorm, getCachedUser } from "@/lib/auth-cache";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const dorms = await getUserDorms()
  const activeDormId = await getActiveDormId()
  const initialDormId =
    dorms.find((dorm) => dorm.id === activeDormId)?.id ??
    dorms[0]?.id ??
    null
  const user = await getCachedUser();
  const initialActualRoles = initialDormId
    ? (await getCachedRolesForDorm(initialDormId)) as AppRole[]
    : [];
  const cookieStore = await cookies();
  const initialActiveRole = (cookieStore.get("dormy_active_role")?.value ?? null) as AppRole | null;
  const initialIsOccupantMode = cookieStore.get("dormy_occupant_mode")?.value === "1";

  return (
    <AuthProvider
      initialUser={user}
      initialActualRoles={initialActualRoles}
      initialDormId={initialDormId}
      initialActiveRole={initialActiveRole}
      initialIsOccupantMode={initialIsOccupantMode}
    >
      <DormProvider dorms={dorms} initialDormId={initialDormId}>
        <RouteProgress />
        <SidebarProvider>
          <AppSidebar />
          <main className="min-w-0 flex-1">
            <header className="flex h-16 items-center justify-between border-b px-4">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <HeaderLogo />
                <HeaderRoleChip />
              </div>
              <div className="flex items-center gap-2">
                <ModeToggle />
                <UserNav />
              </div>
            </header>
            <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <RoleSubpageBackButton />
              {children}
            </div>
          </main>
        </SidebarProvider>
      </DormProvider>
    </AuthProvider>
  )
}
