import { db, unwrap } from "../db/insforge-client.js";
import type { EstimationRuleRow } from "../db/types.js";

let cached: EstimationRuleRow[] | null = null;

/** Reglas de estimación ACTIVAS (aprendidas y aprobadas — spec §18-25), cacheadas por proceso. */
export async function loadActiveEstimationRules(): Promise<EstimationRuleRow[]> {
  if (cached) return cached;
  cached = await unwrap<EstimationRuleRow[]>("select:estimation_rules:active", db.from("estimation_rules").select().eq("status", "active"));
  return cached;
}

export function invalidateEstimationRulesCache() {
  cached = null;
}
