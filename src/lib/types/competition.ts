export type CompetitionEventMeta = {
  id: string;
  title: string;
  is_competition: boolean;
};

export type CompetitionMember = {
  id: string;
  team_id: string;
  occupant_id: string | null;
  display_name: string | null;
  created_at: string;
  occupant_name: string | null;
  occupant_student_id: string | null;
};

export type CompetitionTeam = {
  id: string;
  event_id: string;
  name: string;
  manual_rank_override: number | null;
  created_at: string;
  members: CompetitionMember[];
};

export type CompetitionCategory = {
  id: string;
  event_id: string;
  name: string;
  max_points: number | null;
  sort_order: number;
  created_at: string;
};

export type CompetitionScore = {
  id: string;
  event_id: string;
  team_id: string;
  category_id: string | null;
  points: number;
  created_at: string;
  updated_at: string;
};

export type LeaderboardRow = {
  team_id: string;
  team_name: string;
  total_points: number;
  category_breakdown: Record<string, number>;
  manual_rank_override: number | null;
  rank: number;
  members: CompetitionMember[];
};

export type CompetitionSnapshot = {
  event: CompetitionEventMeta;
  teams: CompetitionTeam[];
  categories: CompetitionCategory[];
  scores: CompetitionScore[];
  leaderboard: LeaderboardRow[];
};
