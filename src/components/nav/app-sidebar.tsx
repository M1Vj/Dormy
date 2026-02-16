"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Calendar,
  FileText,
  Home,
  Sparkles,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useAuth } from "@/components/providers/auth-provider"
import { DormSwitcher } from "@/components/nav/dorm-switcher"

// Menu items.
const items = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Occupants", url: "/occupants", icon: Users },
  { title: "Fines", url: "/fines", icon: FileText },
  { title: "Payments", url: "/payments", icon: Wallet },
  { title: "Cleaning", url: "/cleaning", icon: Calendar },
  { title: "Evaluation", url: "/evaluation", icon: Shield },
  { title: "Events", url: "/events", icon: Calendar },
  { title: "AI", url: "/ai", icon: Sparkles },
  { title: "Admin", url: "/admin", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { role } = useAuth()

  const occupantRoutes = new Set([
    "/home",
    "/events",
    "/payments",
    "/fines",
    "/evaluation",
    "/cleaning",
  ])
  const aiRoles = new Set([
    "admin",
    "officer",
    "student_assistant",
    "treasurer",
    "adviser",
    "assistant_adviser",
  ])
  const visibleItems = items.filter((item) => {
    if (role === "occupant") {
      return occupantRoutes.has(item.url)
    }

    if (item.url === "/admin") {
      return role === "admin" || role === "adviser"
    }

    if (item.url === "/ai") {
      return role ? aiRoles.has(role) : false
    }

    return true
  })

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <DormSwitcher />
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive = pathname === item.url ||
                  (item.url !== "/" && pathname.startsWith(item.url))
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
