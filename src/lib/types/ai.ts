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
