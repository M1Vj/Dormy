import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/nav/app-sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { UserNav } from "@/components/nav/user-nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="w-full">
        <header className="flex h-16 items-center justify-between border-b px-4">
          <div className="flex items-center">
            <SidebarTrigger />
            <span className="ml-4 font-semibold">Molave Men&apos;s Hall</span>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <UserNav />
          </div>
        </header>
        <div className="p-4">{children}</div>
      </main>
    </SidebarProvider>
  )
}
