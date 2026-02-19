"use server";

import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardStats = {
  // Finance summary
  totalCharged: number;
  totalPaid: number;
  totalExpenses: number;
  cashOnHand: number;
  totalCollectibles: number;
  occupantsCleared: number;
  occupantsNotCleared: number;
  totalOccupants: number;
  // Fines summary
  totalFinesIssued: number;
  totalFinesActive: number;
  totalFinesVoided: number;
  totalFinesPesos: number;
  totalFinesPoints: number;
  // Events summary
  totalEvents: number;
  // Ledger breakdown
  maintenanceCharged: number;
  maintenancePaid: number;
  finesCharged: number;
  finesPaid: number;
  eventsCharged: number;
  eventsPaid: number;
  // Clearance details (per occupant)
  clearanceList: ClearanceItem[];
};

export type ClearanceItem = {
  occupant_id: string;
  full_name: string;
  student_id: string | null;
  total_balance: number;
  is_cleared: boolean;
};

export async function getDashboardStats(dormId: string): Promise<DashboardStats | { error: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester." };
  }

  // Get all active occupants
  const { data: occupants } = await supabase
    .from("occupants")
    .select("id, full_name, student_id")
    .eq("dorm_id", dormId)
    .eq("status", "active")
    .order("full_name");

  const occupantList = (occupants ?? []) as Array<{
    id: string;
    full_name: string;
    student_id: string | null;
  }>;

  const { data: activeSemester } = await supabase
    .from("dorm_semesters")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("status", "active")
    .maybeSingle();

  const { data: entries } = await supabase
    .from("ledger_entries")
    .select("occupant_id, amount_pesos, ledger, entry_type, voided_at, semester_id")
    .eq("dorm_id", dormId)
    .is("voided_at", null);

  const entryList = (entries ?? []) as Array<{
    occupant_id: string;
    amount_pesos: number;
    ledger: string;
    entry_type: string;
    voided_at: string | null;
    semester_id: string | null;
  }>;

  // Get ALL approved expenses for the dorm (all time) for Cash on Hand
  const { data: allApprovedExpenses } = await supabase
    .from("expenses")
    .select("amount_pesos, semester_id")
    .eq("dorm_id", dormId)
    .eq("status", "approved");

  const totalAllTimeExpenses = (allApprovedExpenses ?? []).reduce(
    (sum, exp) => sum + Number(exp.amount_pesos),
    0
  );

  const totalThisSemExpenses = (allApprovedExpenses ?? [])
    .filter(exp => exp.semester_id === semesterResult.semesterId)
    .reduce((sum, exp) => sum + Number(exp.amount_pesos), 0);

  // Get fines for this semester
  const { data: fines } = await supabase
    .from("fines")
    .select("id, pesos, points, voided_at")
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId);

  const fineRows = (fines ?? []) as Array<{
    id: string;
    pesos: number;
    points: number;
    voided_at: string | null;
  }>;

  // Get events count for this semester
  const { count: eventCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId);

  // Calculate per-occupant balances
  const occupantBalances = new Map<string, number>();
  for (const occ of occupantList) {
    occupantBalances.set(occ.id, 0);
  }

  let totalAllTimePaid = 0;
  let totalCharged = 0;
  let totalPaid = 0;
  let maintenanceCharged = 0;
  let maintenancePaid = 0;
  let finesCharged = 0;
  let finesPaid = 0;
  let eventsCharged = 0;
  let eventsPaid = 0;

  for (const entry of entryList) {
    const amount = Number(entry.amount_pesos);
    const isPayment = entry.entry_type === "payment" || amount < 0;
    const isThisSem = entry.semester_id === semesterResult.semesterId;
    const ledger = entry.ledger;

    if (isPayment) {
      totalAllTimePaid += Math.abs(amount);
    }

    if (!isThisSem) continue;

    // Update occupant balance (Only this semester for clearance)
    const current = occupantBalances.get(entry.occupant_id) ?? 0;
    occupantBalances.set(entry.occupant_id, current + amount);

    if (isPayment) {
      const absAmount = Math.abs(amount);
      totalPaid += absAmount;
      if (ledger.includes("maintenance")) maintenancePaid += absAmount;
      if (ledger.includes("fines")) finesPaid += absAmount;
      if (ledger.includes("event")) eventsPaid += absAmount;
    } else {
      totalCharged += amount;
      if (ledger.includes("maintenance")) maintenanceCharged += amount;
      if (ledger.includes("fines")) finesCharged += amount;
      if (ledger.includes("event")) eventsCharged += amount;
    }
  }

  const clearanceList: ClearanceItem[] = occupantList.map((occ) => {
    const balance = occupantBalances.get(occ.id) ?? 0;
    return {
      occupant_id: occ.id,
      full_name: occ.full_name,
      student_id: occ.student_id,
      total_balance: balance,
      is_cleared: balance <= 0,
    };
  });

  const occupantsCleared = clearanceList.filter((c) => c.is_cleared).length;
  const occupantsNotCleared = clearanceList.filter((c) => !c.is_cleared).length;

  const activeFines = fineRows.filter((f) => !f.voided_at);
  const voidedFines = fineRows.filter((f) => f.voided_at);

  return {
    totalCharged,
    totalPaid,
    totalExpenses: totalThisSemExpenses,
    cashOnHand: totalAllTimePaid - totalAllTimeExpenses,
    totalCollectibles: totalCharged - totalPaid,
    occupantsCleared,
    occupantsNotCleared,
    totalOccupants: occupantList.length,
    totalFinesIssued: fineRows.length,
    totalFinesActive: activeFines.length,
    totalFinesVoided: voidedFines.length,
    totalFinesPesos: activeFines.reduce((sum, f) => sum + Number(f.pesos), 0),
    totalFinesPoints: activeFines.reduce((sum, f) => sum + Number(f.points), 0),
    totalEvents: eventCount ?? 0,
    maintenanceCharged,
    maintenancePaid,
    finesCharged,
    finesPaid,
    eventsCharged,
    eventsPaid,
    clearanceList: clearanceList.sort((a, b) => b.total_balance - a.total_balance),
  };
}
