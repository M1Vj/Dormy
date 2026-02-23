export type EventConceptDraft = {
  title: string;
  goals: string[];
  timeline: string[];
  budget_items: string[];
  tasks: string[];
  team_hints: string[];
  scoring_hints: string[];
  notes: string;
};

export type FinanceInsights = {
  total_outstanding: number;
  occupants_with_balance: number;
  top_balances: Array<{
    occupant_id: string;
    full_name: string;
    total_balance: number;
  }>;
  open_fines: number;
  voided_fines: number;
  ai_summary: string;
};

export type AiConceptRecord = {
  id: string;
  event_id: string | null;
  raw_text: string;
  structured: EventConceptDraft;
  created_at: string;
  event_title: string | null;
};


/** Role-specific AI insights: SA cleaning & fines snapshot */
export type CleaningFinesInsights = {
  cleaning_areas_count: number;
  current_week_label: string | null;
  assigned_rooms_count: number;
  total_rooms: number;
  active_fines_count: number;
  voided_fines_count: number;
  pending_fine_reports: number;
  total_fine_amount_pesos: number;
  ai_summary: string;
};

/** Role-specific AI insights: Adviser maintenance & clearance snapshot */
export type MaintenanceInsights = {
  maintenance_charged: number;
  maintenance_paid: number;
  maintenance_outstanding: number;
  occupants_cleared: number;
  occupants_not_cleared: number;
  total_occupants: number;
  ai_summary: string;
};

/** Role-specific AI insights: Admin dorm-wide overview */
export type AdminOverviewInsights = {
  total_occupants: number;
  total_events: number;
  cash_on_hand: number;
  total_collectibles: number;
  active_fines: number;
  occupants_cleared: number;
  occupants_not_cleared: number;
  ai_summary: string;
};

/** Union of all role-specific insight types */
export type RoleInsights =
  | { kind: "finance"; data: FinanceInsights }
  | { kind: "cleaning_fines"; data: CleaningFinesInsights }
  | { kind: "maintenance"; data: MaintenanceInsights }
  | { kind: "admin_overview"; data: AdminOverviewInsights }
  | null;
