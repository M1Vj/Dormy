import Image from "next/image"
import Link from "next/link"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/nav/app-sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { HeaderRoleChip } from "@/components/nav/header-role-chip"
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
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <Link href="/home" className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-muted/35">
                    <Image
                      src="/brand/dormy-house.png"
                      alt="Dormy mark"
                      width={20}
                      height={20}
                      className="h-5 w-5"
                      priority
                    />
                  </span>
                  <span className="font-semibold">Dormy</span>
                </Link>
                <HeaderRoleChip />
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
