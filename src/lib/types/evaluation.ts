export type EvaluationSummary = {
  occupant_id: string;
  full_name: string;
  peer_score: number | null;
  adviser_score: number | null;
  rating_score: number;
  total_fine_points: number;
  sa_score: number;
  final_score: number;
};
export type EvaluationCycle = {
  id: string;
  dorm_id: string;
  school_year: string;
  semester: number;
  label: string | null;
  counts_for_retention: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EvaluationTemplate = {
  id: string;
  dorm_id: string;
  cycle_id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  rater_group_weights: Record<string, number>;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type EvaluationMetric = {
  id: string;
  dorm_id: string;
  template_id: string;
  name: string;
  description: string | null;
  weight_pct: number;
  scale_min: number;
  scale_max: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type EvaluationSubmission = {
  template_id: string;
  rater_occupant_id: string;
  ratee_occupant_id: string;
  scores: Record<string, number>;
};
