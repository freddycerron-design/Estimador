import { db, unwrap } from "../db/insforge-client.js";
import type { CostRateRow } from "../db/types.js";

let cached: Map<string, CostRateRow> | null = null;

/** Tarifa activa vigente por rol (spec §14) — cacheada por proceso, invalidar tras editar tarifas. */
export async function loadActiveCostRates(): Promise<Map<string, CostRateRow>> {
  if (cached) return cached;
  const rows = await unwrap<CostRateRow[]>("select:cost_rates:active", db.from("cost_rates").select().eq("is_active", true));
  cached = new Map(rows.map((r) => [r.role_id, r]));
  return cached;
}

export function invalidateCostRatesCache() {
  cached = null;
}
