"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  Calendar,
  ClipboardCheck,
  DoorOpen,
  FileText,
  Home,
  Receipt,
  Shield,
  Users,
  Wallet,
} from "lucide-react";

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
} from "@/components/ui/sidebar";
import { DormSwitcher } from "@/components/nav/dorm-switcher";
import { useAuth } from "@/components/providers/auth-provider";
import { useDorm } from "@/components/providers/dorm-provider";

type MenuItem = {
  title: string;
  url: string;
  icon: typeof Home;
  color: string;
};

function getMenuItems(role: string | null, showTreasurerMaintenance: boolean): MenuItem[] {
  if (!role) {
    return [{ title: "Join", url: "/join", icon: Building2, color: "text-slate-500" }];
  }

  if (role === "admin") {
    return [
      { title: "Home", url: "/admin/home", icon: Home, color: "text-sky-500" },
      { title: "Dorms", url: "/admin/dorms", icon: Building2, color: "text-blue-500" },
      { title: "Semesters", url: "/admin/terms", icon: Calendar, color: "text-indigo-500" },
      { title: "Announcements", url: "/admin/announcements", icon: Bell, color: "text-orange-500" },
      { title: "Settings", url: "/admin/settings", icon: Shield, color: "text-zinc-500" },
    ];
  }

  if (role === "occupant") {
    return [
      { title: "Home", url: "/occupant/home", icon: Home, color: "text-sky-500" },
      { title: "Finance Totals", url: "/occupant/payments", icon: Wallet, color: "text-amber-500" },
      { title: "Fine Reports", url: "/occupant/fines/reports", icon: FileText, color: "text-rose-500" },
      { title: "My Committee", url: "/occupant/committees", icon: Users, color: "text-emerald-500" },
      { title: "Cleaning", url: "/occupant/cleaning", icon: Calendar, color: "text-lime-500" },
      { title: "Events", url: "/occupant/events", icon: Calendar, color: "text-orange-500" },
      { title: "Announcements", url: "/occupant/home/announcements", icon: Bell, color: "text-blue-500" },
    ];
  }

  if (role === "adviser" || role === "assistant_adviser") {
    return [
      { title: "Home", url: "/adviser/home", icon: Home, color: "text-sky-500" },
      { title: "Occupants", url: "/adviser/occupants", icon: Users, color: "text-emerald-500" },
      { title: "Committees", url: "/adviser/committees", icon: Users, color: "text-emerald-500" },
      { title: "Finance", url: "/adviser/finance", icon: Wallet, color: "text-amber-500" },
      { title: "Cleaning", url: "/adviser/cleaning", icon: Calendar, color: "text-lime-500" },
      { title: "Evaluation", url: "/adviser/evaluation", icon: Shield, color: "text-cyan-500" },
      { title: "Events", url: "/adviser/events", icon: Calendar, color: "text-orange-500" },
      { title: "Reporting", url: "/adviser/reporting", icon: ClipboardCheck, color: "text-pink-500" },
      { title: "Announcements", url: "/adviser/home/announcements", icon: Bell, color: "text-blue-500" },
    ];
  }

  if (role === "student_assistant") {
    return [
      { title: "Home", url: "/student_assistant/home", icon: Home, color: "text-sky-500" },
      { title: "Occupants", url: "/student_assistant/occupants", icon: Users, color: "text-emerald-500" },
      { title: "Committees", url: "/student_assistant/committees", icon: Users, color: "text-emerald-500" },
      { title: "Fines", url: "/student_assistant/fines", icon: FileText, color: "text-rose-500" },
      { title: "Finance", url: "/student_assistant/finance", icon: Wallet, color: "text-amber-500" },
      { title: "Cleaning", url: "/student_assistant/cleaning", icon: Calendar, color: "text-lime-500" },
      { title: "Evaluation", url: "/student_assistant/evaluation", icon: Shield, color: "text-cyan-500" },
      { title: "Events", url: "/student_assistant/events", icon: Calendar, color: "text-orange-500" },
      { title: "Reporting", url: "/student_assistant/reporting", icon: ClipboardCheck, color: "text-pink-500" },
      { title: "Announcements", url: "/student_assistant/home/announcements", icon: Bell, color: "text-blue-500" },
    ];
  }

  if (role === "treasurer") {
    const treasurerItems: MenuItem[] = [
      { title: "Home", url: "/treasurer/home", icon: Home, color: "text-sky-500" },
      { title: "Finance", url: "/treasurer/finance", icon: Wallet, color: "text-amber-500" },
      { title: "Contributions", url: "/treasurer/contributions", icon: Calendar, color: "text-orange-500" },
      { title: "Contribution Expenses", url: "/treasurer/contribution-expenses", icon: Receipt, color: "text-emerald-500" },
      { title: "Reporting", url: "/treasurer/reporting", icon: ClipboardCheck, color: "text-pink-500" },
      { title: "Events", url: "/treasurer/events", icon: Calendar, color: "text-orange-500" },
    ];

    if (showTreasurerMaintenance) {
      treasurerItems.splice(2, 0, { title: "Maintenance", url: "/treasurer/finance/maintenance", icon: Wallet, color: "text-cyan-500" });
      treasurerItems.splice(3, 0, { title: "Maintenance Expenses", url: "/treasurer/finance/expenses?category=maintenance_fee", icon: FileText, color: "text-emerald-500" });
    }

    return treasurerItems;
  }

  if (role === "officer") {
    return [
      { title: "Home", url: "/officer/home", icon: Home, color: "text-sky-500" },
      { title: "Events", url: "/officer/events", icon: Calendar, color: "text-orange-500" },
      { title: "Expenses", url: "/officer/finance/expenses", icon: Wallet, color: "text-amber-500" },
      { title: "Reporting", url: "/officer/reporting", icon: ClipboardCheck, color: "text-pink-500" },
    ];
  }

  return [
    { title: "Home", url: `/${role}/home`, icon: Home, color: "text-sky-500" },
    { title: "Rooms", url: `/${role}/rooms`, icon: DoorOpen, color: "text-teal-500" },
  ];
}

export function AppSidebar() {
  const pathname = usePathname();
  const { role } = useAuth();
  const { activeDorm } = useDorm();
  const { isMobile, setOpenMobile } = useSidebar();
  const showTreasurerMaintenance = activeDorm?.treasurer_maintenance_access === true;

  const menuItems = useMemo(() => getMenuItems(role, showTreasurerMaintenance), [role, showTreasurerMaintenance]);

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
                const resolvedUrl = item.url;
                const resolvedPath = resolvedUrl.split("?")[0];
                const isActive = pathname === resolvedPath || (resolvedPath !== "/" && pathname.startsWith(`${resolvedPath}/`));

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={resolvedUrl}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <item.icon className={isActive ? "text-primary" : item.color} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
