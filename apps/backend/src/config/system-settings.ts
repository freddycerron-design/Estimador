import { db, unwrap } from "../db/insforge-client.js";
import type { SystemSettingRow } from "../db/types.js";
import { DEFAULT_SYSTEM_SETTINGS } from "../db/seed/reference-data.js";

/**
 * Config global versionada en DB (spec §7-9): MIN_SIMILARITY_THRESHOLD, MAX_ADAPTIVE_ITERATIONS,
 * DEFAULT_CONTINGENCY_PCT, DEFAULT_OVERHEAD_PCT, OUTLIER_ZSCORE_THRESHOLD. Nunca hardcodear estos
 * valores en la lógica de negocio — siempre resolverlos desde acá.
 */
export async function loadSystemSettings(): Promise<Record<string, unknown>> {
  const rows = await unwrap<SystemSettingRow[]>("select:system_settings", db.from("system_settings").select());
  const settings: Record<string, unknown> = { ...DEFAULT_SYSTEM_SETTINGS };
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

export function getSetting<T>(settings: Record<string, unknown>, key: string, fallback: T): T {
  return (settings[key] as T | undefined) ?? fallback;
}
