/**
 * Las 5 claves de `system_settings` que el usuario puede además ajustar POR-ESTIMACIÓN, con un
 * check "aplicar en esta estimación" (spec pedido por usuario). Espejo manual del mismo set que
 * vive en `@estimador/shared-types` del lado backend — el frontend no depende de ese paquete
 * (sigue la misma convención que `api-client.ts`: los contratos se replican como TS plano acá).
 */
export const ESTIMATION_PARAMETER_KEYS = [
  "MIN_SIMILARITY_THRESHOLD",
  "MAX_ADAPTIVE_ITERATIONS",
  "DEFAULT_CONTINGENCY_PCT",
  "DEFAULT_OVERHEAD_PCT",
  "OUTLIER_ZSCORE_THRESHOLD",
] as const;

export type EstimationParameterKey = (typeof ESTIMATION_PARAMETER_KEYS)[number];

export interface EstimationParameterEntry {
  included: boolean;
  value: number;
}

export type EstimationParameters = Partial<Record<EstimationParameterKey, EstimationParameterEntry>>;

export const ESTIMATION_PARAMETER_LABELS: Record<EstimationParameterKey, string> = {
  MIN_SIMILARITY_THRESHOLD: "Umbral mínimo de similitud",
  MAX_ADAPTIVE_ITERATIONS: "Máx. iteraciones de preguntas adaptativas",
  DEFAULT_CONTINGENCY_PCT: "Contingencia por defecto",
  DEFAULT_OVERHEAD_PCT: "Overhead por defecto",
  OUTLIER_ZSCORE_THRESHOLD: "Umbral de outlier (score-Z modificado)",
};

// Claves que se guardan como fracción 0-1 pero se muestran/editan como % (0.25 -> "25") — mismo
// criterio que /admin. El resto (iteraciones, z-score) se muestra tal cual, sin conversión.
export const ESTIMATION_PARAMETER_PERCENT_KEYS = new Set<EstimationParameterKey>(["MIN_SIMILARITY_THRESHOLD", "DEFAULT_CONTINGENCY_PCT", "DEFAULT_OVERHEAD_PCT"]);

// Claves cuyo VALOR el usuario puede editar por-estimación (spec pedido por usuario) — las otras
// 3 quedan siempre marcadas/aplicadas con el valor global vigente, sin poder tocarlo acá.
export const ESTIMATION_PARAMETER_VALUE_EDITABLE_KEYS = new Set<EstimationParameterKey>(["DEFAULT_CONTINGENCY_PCT", "DEFAULT_OVERHEAD_PCT"]);

/** Fallback si `/admin/config/system-settings` no trajera alguna clave — mismo default que `DEFAULT_SYSTEM_SETTINGS` en el backend. */
export const ESTIMATION_PARAMETER_FALLBACKS: Record<EstimationParameterKey, number> = {
  MIN_SIMILARITY_THRESHOLD: 0.75,
  MAX_ADAPTIVE_ITERATIONS: 5,
  DEFAULT_CONTINGENCY_PCT: 0.15,
  DEFAULT_OVERHEAD_PCT: 0.1,
  OUTLIER_ZSCORE_THRESHOLD: 2.5,
};

/** Objeto con las 5 claves completas, todas con `included:false` — punto de partida antes de cargar ningún valor. */
export function emptyEstimationParameterForm(): Record<EstimationParameterKey, EstimationParameterEntry> {
  return Object.fromEntries(
    ESTIMATION_PARAMETER_KEYS.map((key) => [key, { included: false, value: ESTIMATION_PARAMETER_FALLBACKS[key] }])
  ) as Record<EstimationParameterKey, EstimationParameterEntry>;
}
