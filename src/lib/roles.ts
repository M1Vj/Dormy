export const roles = [
  "admin",
  "student_assistant",
  "treasurer",
  "adviser",
  "assistant_adviser",
  "occupant",
  "officer",
] as const;

export type AppRole = (typeof roles)[number];

const roleLabelMap: Record<AppRole, string> = {
  admin: "Admin",
  student_assistant: "Student Assistant",
  treasurer: "Treasurer",
  adviser: "Adviser",
  assistant_adviser: "Assistant Adviser",
  occupant: "Occupant",
  officer: "Officer",
};

const roleSummaryMap: Record<AppRole, string> = {
  admin: "Full dorm management permissions across accounts, operations, and ledgers.",
  student_assistant: "Can manage occupants and fines, including account support workflows.",
  treasurer: "Handles event collections and finance-related recording workflows.",
  adviser: "Oversees adviser workflows, including maintenance and delegated account setup.",
  assistant_adviser: "Supports maintenance and adviser-assigned dorm operations.",
  occupant: "Can view personal ledgers, schedules, evaluations, and shared announcements.",
  officer: "Focuses on event planning, execution, and event records.",
};

export function getRoleLabel(role: AppRole | null | undefined) {
  if (!role) return "Unknown";
  return roleLabelMap[role] ?? role.replace(/_/g, " ");
}

export function getRoleSummary(role: AppRole | null | undefined) {
  if (!role) return "Role permissions are not available yet.";
  return roleSummaryMap[role] ?? "Role permissions are configured by dorm administrators.";
}
