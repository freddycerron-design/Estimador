import { z } from "zod";

/**
 * Las 5 claves de `system_settings` que el usuario puede además ajustar POR-ESTIMACIÓN (spec
 * pedido por usuario: al iniciar una estimación se presentan estos parámetros con un check
 * "¿aplicar en esta estimación?" y un valor editable, precargados con el global vigente).
 * Mismo set de claves que administra /admin/config — acá el override es local a una
 * conversación/estimación y nunca toca la configuración global.
 */
export const ESTIMATION_PARAMETER_KEYS = [
  "MIN_SIMILARITY_THRESHOLD",
  "MAX_ADAPTIVE_ITERATIONS",
  "DEFAULT_CONTINGENCY_PCT",
  "DEFAULT_OVERHEAD_PCT",
  "OUTLIER_ZSCORE_THRESHOLD",
] as const;

export const EstimationParameterKeySchema = z.enum(ESTIMATION_PARAMETER_KEYS);
export type EstimationParameterKey = z.infer<typeof EstimationParameterKeySchema>;

export const EstimationParameterEntrySchema = z.object({
  included: z.boolean(),
  value: z.number(),
});
export type EstimationParameterEntry = z.infer<typeof EstimationParameterEntrySchema>;

/**
 * `{ MIN_SIMILARITY_THRESHOLD: {included, value}, ... }`. Todas las claves son opcionales —
 * una conversación creada antes de este feature (o sin ningún override marcado) simplemente
 * no trae `parameters`, y el comportamiento es el de siempre (global de system_settings).
 */
export const EstimationParametersSchema = z
  .object(
    Object.fromEntries(ESTIMATION_PARAMETER_KEYS.map((k) => [k, EstimationParameterEntrySchema])) as Record<
      EstimationParameterKey,
      typeof EstimationParameterEntrySchema
    >
  )
  .partial();
export type EstimationParameters = z.infer<typeof EstimationParametersSchema>;
