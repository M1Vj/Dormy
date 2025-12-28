import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/nav/app-sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { UserNav } from "@/components/nav/user-nav"
import { AuthProvider } from "@/components/providers/auth-provider"
import { DormProvider } from "@/components/providers/dorm-provider"
import { getActiveDormId, getUserDorms } from "@/lib/dorms"

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

  return (
    <AuthProvider>
      <DormProvider dorms={dorms} initialDormId={initialDormId}>
        <SidebarProvider>
          <AppSidebar />
          <main className="w-full">
            <header className="flex h-16 items-center justify-between border-b px-4">
              <div className="flex items-center">
                <SidebarTrigger />
                <span className="ml-4 font-semibold">Dormy</span>
              </div>
              <div className="flex items-center gap-2">
                <ModeToggle />
                <UserNav />
              </div>
            </header>
            <div className="p-4">{children}</div>
          </main>
        </SidebarProvider>
      </DormProvider>
    </AuthProvider>
  )
}
