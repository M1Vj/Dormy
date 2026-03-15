export const DEFAULT_GADGET_FEE_PESOS = 50;
export const DORM_GADGET_FEE_ATTRIBUTE_KEY = "gadget_fee_pesos";

export type OccupantGadget = {
  id: string;
  dorm_id: string;
  occupant_id: string;
  gadget_type: string;
  gadget_label: string;
  default_fee_pesos: number;
  is_active: boolean;
  assigned_at: string;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeDormGadgetFee(value: unknown) {
  const parsed = Number(value ?? NaN);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_GADGET_FEE_PESOS;
  }

  return Number(parsed.toFixed(2));
}

export function resolveOccupantGadgetFee(gadget: {
  default_fee_pesos?: number | string | null;
}) {
  return normalizeDormGadgetFee(gadget.default_fee_pesos);
}

export function getGadgetDisplayName(gadget: {
  gadget_type?: string | null;
  gadget_label?: string | null;
}) {
  const type = gadget.gadget_type?.trim() || "Gadget";
  const label = gadget.gadget_label?.trim() || "";
  return label ? `${type} • ${label}` : type;
}
