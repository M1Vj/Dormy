export type LedgerCategory = 'maintenance_fee' | 'sa_fines' | 'contributions';
export type EntryType = 'charge' | 'payment' | 'adjustment' | 'refund';

export type LedgerEntry = {
  id: string;
  dorm_id: string;
  ledger: LedgerCategory;
  entry_type: EntryType;
  occupant_id: string | null;
  event_id: string | null;
  fine_id: string | null;
  posted_at: string; // ISO timestamp
  amount_pesos: number;
  method: string | null;
  note: string | null;
  metadata: Record<string, unknown>; // JSONB
  created_by: string | null;
  voided_at: string | null; // ISO timestamp
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateLedgerEntryInput = {
  dorm_id: string;
  ledger: LedgerCategory;
  entry_type: EntryType;
  occupant_id?: string | null;
  event_id?: string | null;
  fine_id?: string | null;
  amount_pesos: number;
  method?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  posted_at?: string; // Optional, defaults to now in DB if not provided, but useful to set
};
