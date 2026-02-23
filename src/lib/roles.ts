export const roles = [
  "admin",
  "adviser",
  "assistant_adviser",
  "student_assistant",
  "treasurer",
  "officer",
  "occupant",
] as const;

export type AppRole = (typeof roles)[number];

const roleLabelMap: Record<AppRole, string> = {
  admin: "Admin",
  adviser: "Adviser",
  assistant_adviser: "Assistant Adviser",
  student_assistant: "Student Assistant",
  treasurer: "Treasurer",
  officer: "Officer",
  occupant: "Occupant",
};

const roleSummaryMap: Record<AppRole, string> = {
  admin: "Manages dorm setup, occupant records, clearance, and semester controls.",
  adviser: "Handles occupant operations, maintenance finance, evaluations, announcements, and reports.",
  assistant_adviser: "Supports adviser workflows for occupants, finance, evaluations, and reports.",
  student_assistant: "Handles occupant operations, fines review, maintenance finance, and reporting.",
  treasurer: "Handles contribution collection and contribution-ledger workflows.",
  officer: "Focuses on committee and event operations.",
  occupant: "Can view dorm-level updates, schedules, committees, events, and finance totals.",
};

export function getRoleLabel(role: AppRole | null | undefined) {
  if (!role) return "Unknown";
  return roleLabelMap[role] ?? role.replace(/_/g, " ");
}

export function getRoleSummary(role: AppRole | null | undefined) {
  if (!role) return "Role permissions are not available yet.";
  return roleSummaryMap[role] ?? "Role permissions are configured by dorm administrators.";
}

export const roleWeights: Record<AppRole, number> = {
  admin: 100,
  adviser: 70,
  assistant_adviser: 70,
  student_assistant: 70,
  treasurer: 50,
  officer: 40,
  occupant: 10,
};

export function getRoleWeight(role: AppRole | string | null | undefined): number {
  if (!role || !(role in roleWeights)) return 0;
  return roleWeights[role as AppRole];
}

export function canManageRole(managerRole: AppRole | string, targetRole: AppRole | string): boolean {
  return getRoleWeight(managerRole) >= getRoleWeight(targetRole);
}
