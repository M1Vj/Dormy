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
  DoorOpen,
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
  { title: "Home", url: "/home", icon: Home, color: "text-sky-500" },
  { title: "Join", url: "/join", icon: Building2, color: "text-slate-500" },
  { title: "Applications", url: "/applications", icon: UserPlus, color: "text-indigo-500" },
  { title: "Occupants", url: "/occupants", icon: Users, color: "text-emerald-500" },
  { title: "Rooms", url: "/admin/rooms", icon: DoorOpen, color: "text-teal-500" },
  { title: "Committees", url: "/committees", icon: Users, color: "text-violet-500" },
  { title: "Fines", url: "/fines", icon: FileText, color: "text-rose-500" },
  { title: "Payments", url: "/payments", icon: Wallet, color: "text-amber-500" },
  { title: "Cleaning", url: "/cleaning", icon: Calendar, color: "text-lime-500" },
  { title: "Evaluation", url: "/evaluation", icon: Shield, color: "text-cyan-500" },
  { title: "Events", url: "/events", icon: Calendar, color: "text-orange-500" },
  { title: "Reporting", url: "/admin/reporting", icon: BarChart3, color: "text-pink-500" },
  { title: "AI", url: "/ai", icon: Sparkles, color: "text-purple-500" },
  { title: "Admin", url: "/admin", icon: Settings, color: "text-zinc-500" },
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
    "/committees",
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

    if (item.url === "/admin/rooms") {
      return new Set(["admin", "student_assistant", "adviser"]).has(role)
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
                        <item.icon className={isActive ? "text-primary" : item.color} />
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
