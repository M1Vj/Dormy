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
  Wrench,
  Receipt,
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
import { useMemo } from "react"

export function AppSidebar() {
  const pathname = usePathname()
  const { role } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()

  const menuItems = useMemo(() => {
    if (!role) {
      return [{ title: "Join", url: "/join", icon: Building2, color: "text-slate-500" }];
    }

    const base = [
      { title: "Home", url: `/${role}/home`, icon: Home, color: "text-sky-500" },
    ];

    if (role === "occupant") {
      return [
        ...base,
        { title: "Committees", url: "/occupant/committees", icon: Users, color: "text-violet-500" },
        { title: "Fines", url: "/occupant/fines", icon: FileText, color: "text-rose-500" },
        { title: "Payments", url: "/occupant/payments", icon: Wallet, color: "text-amber-500" },
        { title: "Cleaning", url: "/occupant/cleaning", icon: Calendar, color: "text-lime-500" },
        { title: "Evaluation", url: "/occupant/evaluation", icon: Shield, color: "text-cyan-500" },
        { title: "Events", url: "/occupant/events", icon: Calendar, color: "text-orange-500" },
        { title: "Reporting", url: "/reporting", icon: BarChart3, color: "text-pink-500" },
      ];
    } else if (role === "admin") {
      return [
        ...base,
        { title: "Occupants", url: "/admin/occupants", icon: Users, color: "text-emerald-500" },
        { title: "Rooms", url: "/admin/rooms", icon: DoorOpen, color: "text-teal-500" },
        { title: "Committees", url: "/occupant/committees", icon: Users, color: "text-violet-500" },
        { title: "Fines", url: "/admin/fines", icon: FileText, color: "text-rose-500" },
        { title: "Finance", url: "/admin/finance", icon: Wallet, color: "text-amber-500" },
        { title: "Evaluation", url: "/admin/evaluation", icon: Shield, color: "text-cyan-500" },
        { title: "Reporting", url: "/reporting", icon: BarChart3, color: "text-pink-500" },
        { title: "AI", url: "/ai", icon: Sparkles, color: "text-purple-500" },
        { title: "Settings", url: "/admin", icon: Settings, color: "text-zinc-500" },
      ];
    } else if (role === "student_assistant") {
      return [
        ...base,
        { title: "Occupants", url: "/admin/occupants", icon: Users, color: "text-emerald-500" },
        { title: "Rooms", url: "/admin/rooms", icon: DoorOpen, color: "text-teal-500" },
        { title: "Fines", url: "/admin/fines", icon: FileText, color: "text-rose-500" },
        { title: "Inspection", url: "/occupant/cleaning", icon: Calendar, color: "text-lime-500" },
        { title: "Maintenance", url: "/admin/finance/maintenance", icon: Wrench, color: "text-blue-500" },
        { title: "Reporting", url: "/reporting", icon: BarChart3, color: "text-pink-500" },
        { title: "AI", url: "/ai", icon: Sparkles, color: "text-purple-500" },
      ];
    } else if (role === "treasurer") {
      return [
        ...base,
        { title: "Payments", url: "/occupant/payments", icon: Wallet, color: "text-amber-500" },
        { title: "Dorm Finance", url: "/admin/finance", icon: Wallet, color: "text-emerald-500" },
        { title: "Reporting", url: "/reporting", icon: BarChart3, color: "text-pink-500" },
        { title: "AI", url: "/ai", icon: Sparkles, color: "text-purple-500" },
      ];
    } else if (role === "adviser") {
      return [
        ...base,
        { title: "Occupants", url: "/admin/occupants", icon: Users, color: "text-emerald-500" },
        { title: "Rooms", url: "/admin/rooms", icon: DoorOpen, color: "text-teal-500" },
        { title: "Evaluation", url: "/admin/evaluation", icon: Shield, color: "text-cyan-500" },
        { title: "Reporting", url: "/reporting", icon: BarChart3, color: "text-pink-500" },
        { title: "Settings", url: "/admin", icon: Settings, color: "text-zinc-500" },
        { title: "AI", url: "/ai", icon: Sparkles, color: "text-purple-500" },
      ];
    } else {
      // Fallback for officer, etc.
      return [
        ...base,
        { title: "Events", url: "/occupant/events", icon: Calendar, color: "text-orange-500" },
        { title: "Expenses", url: "/admin/finance/expenses", icon: Receipt, color: "text-green-500" },
        { title: "AI", url: "/ai", icon: Sparkles, color: "text-purple-500" },
      ];
    }
  }, [role]);

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <DormSwitcher />
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const resolvedUrl = item.url
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
