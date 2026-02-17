"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Calendar,
  FileText,
  Home,
  Sparkles,
  Settings,
  Shield,
  Users,
  Wallet,
  UserPlus,
  Building2,
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
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuth } from "@/components/providers/auth-provider"
import { DormSwitcher } from "@/components/nav/dorm-switcher"

// Menu items.
const items = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Join", url: "/join", icon: Building2 },
  { title: "Applications", url: "/applications", icon: UserPlus },
  { title: "Occupants", url: "/occupants", icon: Users },
  { title: "Fines", url: "/fines", icon: FileText },
  { title: "Payments", url: "/payments", icon: Wallet },
  { title: "Cleaning", url: "/cleaning", icon: Calendar },
  { title: "Evaluation", url: "/evaluation", icon: Shield },
  { title: "Events", url: "/events", icon: Calendar },
  { title: "Reporting", url: "/admin/reporting", icon: BarChart3 },
  { title: "AI", url: "/ai", icon: Sparkles },
  { title: "Admin", url: "/admin", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { role } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()

  const directAdminOccupants =
    role === "admin" || role === "student_assistant"
  const directAdminFines =
    role === "admin" || role === "student_assistant"

  const occupantRoutes = new Set([
    "/home",
    "/events",
    "/payments",
    "/fines",
    "/evaluation",
    "/cleaning",
  ])
  const staffApplicationRoles = new Set([
    "admin",
    "adviser",
    "student_assistant",
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
    if (!role) {
      return item.url === "/join"
    }

    if (role === "occupant") {
      return occupantRoutes.has(item.url)
    }

    if (item.url === "/applications") {
      return staffApplicationRoles.has(role)
    }

    if (item.url === "/admin") {
      return role === "admin" || role === "adviser"
    }

    if (item.url === "/ai") {
      return role ? aiRoles.has(role) : false
    }

    if (item.url === "/admin/reporting") {
      return new Set(["admin", "treasurer", "student_assistant", "adviser"]).has(role)
    }

    if (item.url === "/join") {
      return false
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
                const resolvedUrl =
                  item.url === "/occupants" && directAdminOccupants
                    ? "/admin/occupants"
                    : item.url === "/fines" && directAdminFines
                      ? "/admin/fines"
                      : item.url

                const isActive = pathname === resolvedUrl ||
                  (resolvedUrl !== "/" && pathname.startsWith(resolvedUrl))
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={resolvedUrl}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false)
                        }}
                      >
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
