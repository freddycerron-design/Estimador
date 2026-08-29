/**
 * Sistema visual propio para la procedencia de cada número (spec: FACTUAL/CALCULATED/INFERRED/
 * ASSUMPTION/UNKNOWN — la trazabilidad es el principio central del producto, no un detalle).
 * Antes se mostraba como un badge gris genérico, idéntico a cualquier otro estado de la app —
 * acá cada valor tiene su propio color, para que la confiabilidad de un número se lea de un
 * vistazo sin tener que leer el texto.
 */
export type Provenance = "FACTUAL" | "CALCULATED" | "INFERRED" | "ASSUMPTION" | "UNKNOWN";

export interface ProvenanceMeta {
  label: string;
  hint: string;
  dot: string;
  text: string;
}

// Los `dot`/`text` llevan su propia variante `dark:` embebida (modo oscuro adicional al claro,
// spec pedido por usuario). Dos casos cambian de familia de color en oscuro, no solo de tono:
// CALCULATED (navy-600/700 está pensado para leerse sobre blanco y casi desaparece sobre el fondo
// navy oscuro de la app) e INFERRED (el violeta de `accent` se perdía en oscuro — pasa a `azure`,
// un azul pensado para contrastar sobre navy; ver tailwind.config.ts). El resto (colores saturados
// por defecto de Tailwind) ya lee bien en ambos fondos, solo se aclara el tono de texto.
export const PROVENANCE_META: Record<Provenance, ProvenanceMeta> = {
  FACTUAL: {
    label: "Factual",
    hint: "Dato real, tomado directamente de un proyecto histórico.",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  CALCULATED: {
    label: "Calculado",
    hint: "Derivado matemáticamente a partir de datos factuales (promedios, ponderaciones).",
    dot: "bg-navy-600 dark:bg-slate-400",
    text: "text-navy-700 dark:text-slate-300",
  },
  INFERRED: {
    label: "Inferido",
    hint: "El agente lo dedujo de patrones — no viene de un dato exacto.",
    dot: "bg-accent-500 dark:bg-azure-500",
    text: "text-accent-700 dark:text-azure-300",
  },
  ASSUMPTION: {
    label: "Supuesto",
    hint: "No había información suficiente; se asumió un valor razonable para poder estimar.",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
  },
  UNKNOWN: {
    label: "Desconocido",
    hint: "No se pudo determinar — falta evidencia o el dato no está disponible.",
    dot: "bg-slate-400 dark:bg-slate-500",
    text: "text-slate-500 dark:text-slate-400",
  },
};

const FALLBACK: ProvenanceMeta = {
  label: "—",
  hint: "Sin clasificar.",
  dot: "bg-slate-300 dark:bg-slate-600",
  text: "text-slate-400 dark:text-slate-500",
};

export function provenanceMeta(value: string): ProvenanceMeta {
  return PROVENANCE_META[value as Provenance] ?? FALLBACK;
}
