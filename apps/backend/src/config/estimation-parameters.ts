import { ESTIMATION_PARAMETER_KEYS, type EstimationParameters } from "@estimador/shared-types";

/**
 * Aplica los overrides POR-ESTIMACIÓN (`conversations.parameters`, la intención que el usuario
 * marcó al iniciar la conversación) sobre los `system_settings` globales ya resueltos: para cada
 * clave con `included:true` el valor del override reemplaza al global SOLO para esta conversación,
 * sin tocar `/admin`. Único lugar donde se hace este merge — las Skills siguen leyendo `ctx.settings`
 * con `getSetting()` exactamente igual que antes, sin saber que existe este override.
 */
export function applyParameterOverrides(
  globalSettings: Record<string, unknown>,
  overrides: EstimationParameters | null | undefined
): Record<string, unknown> {
  if (!overrides) return globalSettings;
  const merged = { ...globalSettings };
  for (const key of ESTIMATION_PARAMETER_KEYS) {
    const entry = overrides[key];
    if (entry?.included) merged[key] = entry.value;
  }
  return merged;
}

/**
 * Snapshot de los 5 parámetros de estimación EFECTIVAMENTE usados (no solo lo que el usuario
 * marcó) a partir de `settings` YA MERGEADOS por `applyParameterOverrides` — así el valor
 * congelado es el que realmente participó en el cálculo, con trazabilidad de si vino de un
 * override de esta conversación o del global vigente en ese momento.
 */
export function resolveEffectiveParameters(
  mergedSettings: Record<string, unknown>,
  overrides: EstimationParameters | null | undefined
): EstimationParameters {
  const result: EstimationParameters = {};
  for (const key of ESTIMATION_PARAMETER_KEYS) {
    const included = overrides?.[key]?.included ?? false;
    result[key] = { included, value: mergedSettings[key] as number };
  }
  return result;
}
