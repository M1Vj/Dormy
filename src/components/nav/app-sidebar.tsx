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
import { useMemo, useEffect, useState } from "react"
import { getTreasurerMaintenanceAccess } from "@/app/actions/dorm"

export function AppSidebar() {
  const pathname = usePathname()
  const { role, dormId } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const [treasurerAccess, setTreasurerAccess] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      if (dormId && (role === "treasurer" || role === "officer")) {
        const result = await getTreasurerMaintenanceAccess(dormId);
        if (!result.error && result.access !== undefined) {
          setTreasurerAccess(result.access);
        }
      }
    }
    checkAccess();
  }, [dormId, role]);

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
        { title: "Committees", url: `/${role}/committees`, icon: Users, color: "text-violet-500" },
        { title: "Fines", url: `/${role}/fines`, icon: FileText, color: "text-rose-500" },
        { title: "Payments", url: `/${role}/payments`, icon: Wallet, color: "text-amber-500" },
        { title: "Cleaning", url: `/${role}/cleaning`, icon: Calendar, color: "text-lime-500" },
        { title: "Evaluation", url: `/${role}/evaluation`, icon: Shield, color: "text-cyan-500" },
        { title: "Events", url: `/${role}/events`, icon: Calendar, color: "text-orange-500" },
        { title: "Reporting", url: `/${role}/reporting`, icon: BarChart3, color: "text-pink-500" },
      ];
    } else if (role === "admin") {
      return [
        ...base,
        { title: "Occupants", url: `/${role}/occupants`, icon: Users, color: "text-emerald-500" },
        { title: "Rooms", url: `/${role}/rooms`, icon: DoorOpen, color: "text-teal-500" },
        { title: "Committees", url: `/${role}/committees`, icon: Users, color: "text-violet-500" },
        { title: "Fines", url: `/${role}/fines`, icon: FileText, color: "text-rose-500" },
        { title: "Finance", url: `/${role}/finance`, icon: Wallet, color: "text-amber-500" },
        { title: "Evaluation", url: `/${role}/evaluation`, icon: Shield, color: "text-cyan-500" },
        { title: "Events", url: `/${role}/events`, icon: Calendar, color: "text-orange-500" },
        { title: "Reporting", url: `/${role}/reporting`, icon: BarChart3, color: "text-pink-500" },
        { title: "AI", url: `/${role}/ai`, icon: Sparkles, color: "text-purple-500" },
        { title: "Settings", url: `/${role}/settings`, icon: Settings, color: "text-zinc-500" },
        { title: "Overrides", url: `/${role}/overrides`, icon: Wrench, color: "text-orange-500" },
        { title: "Audit Log", url: `/${role}/audit`, icon: FileText, color: "text-slate-500" },
        { title: "Dorms", url: `/${role}/dorms`, icon: Building2, color: "text-blue-500" },
      ];
    } else if (role === "student_assistant") {
      return [
        ...base,
        { title: "Occupants", url: `/${role}/occupants`, icon: Users, color: "text-emerald-500" },
        { title: "Rooms", url: `/${role}/rooms`, icon: DoorOpen, color: "text-teal-500" },
        { title: "Fines", url: `/${role}/fines`, icon: FileText, color: "text-rose-500" },
        { title: "Cleaning", url: `/${role}/cleaning`, icon: Calendar, color: "text-lime-500" },
        { title: "Maintenance", url: `/${role}/finance/maintenance`, icon: Wrench, color: "text-blue-500" },
        { title: "Reporting", url: `/${role}/reporting`, icon: BarChart3, color: "text-pink-500" },
        { title: "AI", url: `/${role}/ai`, icon: Sparkles, color: "text-purple-500" },
        { title: "Evaluation", url: `/${role}/evaluation`, icon: Shield, color: "text-cyan-500" },
        { title: "Events", url: `/${role}/events`, icon: Calendar, color: "text-orange-500" },
      ];
    } else if (role === "treasurer") {
      const items = [
        ...base,
        { title: "Payments", url: `/${role}/payments`, icon: Wallet, color: "text-amber-500" },
        { title: "Dorm Finance", url: `/${role}/finance`, icon: Wallet, color: "text-emerald-500" },
      ];
      if (treasurerAccess) {
        items.push({ title: "Maintenance", url: `/${role}/finance/maintenance`, icon: Wrench, color: "text-blue-500" });
      }
      items.push(
        { title: "Reporting", url: `/${role}/reporting`, icon: BarChart3, color: "text-pink-500" },
        { title: "AI", url: `/${role}/ai`, icon: Sparkles, color: "text-purple-500" }
      );
      return items;
    } else if (role === "adviser") {
      return [
        ...base,
        { title: "Occupants", url: `/${role}/occupants`, icon: Users, color: "text-emerald-500" },
        { title: "Rooms", url: `/${role}/rooms`, icon: DoorOpen, color: "text-teal-500" },
        { title: "Maintenance", url: `/${role}/finance/maintenance`, icon: Wrench, color: "text-blue-500" },
        { title: "Evaluation", url: `/${role}/evaluation`, icon: Shield, color: "text-cyan-500" },
        { title: "Reporting", url: `/${role}/reporting`, icon: BarChart3, color: "text-pink-500" },
        { title: "Settings", url: `/${role}/settings`, icon: Settings, color: "text-zinc-500" },
      ];
    } else {
      // Fallback for officer, etc.
      const items = [
        ...base,
        { title: "Events", url: `/${role}/events`, icon: Calendar, color: "text-orange-500" },
        { title: "Expenses", url: `/${role}/finance/expenses`, icon: Receipt, color: "text-green-500" },
      ];
      if (treasurerAccess) {
        items.push({ title: "Maintenance", url: `/${role}/finance/maintenance`, icon: Wrench, color: "text-blue-500" });
      }
      items.push(
        { title: "AI", url: `/${role}/ai`, icon: Sparkles, color: "text-purple-500" }
      );
      return items;
    }
  }, [role, treasurerAccess]);

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
