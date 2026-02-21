export const roles = [
  "admin",
  "adviser",
  "student_assistant",
  "treasurer",
  "officer",
  "occupant",
] as const;

export type AppRole = (typeof roles)[number];

const roleLabelMap: Record<AppRole, string> = {
  admin: "Admin",
  adviser: "Adviser",
  student_assistant: "Student Assistant",
  treasurer: "Treasurer",
  officer: "Officer",
  occupant: "Occupant",
};

const roleSummaryMap: Record<AppRole, string> = {
  admin: "Full dorm management permissions across accounts, operations, and ledgers.",
  adviser: "Oversees adviser workflows, including maintenance and delegated account setup.",
  student_assistant: "Can manage occupants and fines, including account support workflows.",
  treasurer: "Handles event collections and finance-related recording workflows.",
  officer: "Focuses on event planning, execution, and event records.",
  occupant: "Can view personal ledgers, schedules, evaluations, and shared announcements.",
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
  admin: 70,
  adviser: 60,
  student_assistant: 50,
  treasurer: 40,
  officer: 30,
  occupant: 10,
};

export function getRoleWeight(role: AppRole | string | null | undefined): number {
  if (!role || !(role in roleWeights)) return 0;
  return roleWeights[role as AppRole];
}

export function canManageRole(managerRole: AppRole | string, targetRole: AppRole | string): boolean {
  return getRoleWeight(managerRole) >= getRoleWeight(targetRole);
}
