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

export const PROVENANCE_META: Record<Provenance, ProvenanceMeta> = {
  FACTUAL: {
    label: "Factual",
    hint: "Dato real, tomado directamente de un proyecto histórico.",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
  },
  CALCULATED: {
    label: "Calculado",
    hint: "Derivado matemáticamente a partir de datos factuales (promedios, ponderaciones).",
    dot: "bg-navy-600",
    text: "text-navy-700",
  },
  INFERRED: {
    label: "Inferido",
    hint: "El agente lo dedujo de patrones — no viene de un dato exacto.",
    dot: "bg-accent-500",
    text: "text-accent-700",
  },
  ASSUMPTION: {
    label: "Supuesto",
    hint: "No había información suficiente; se asumió un valor razonable para poder estimar.",
    dot: "bg-amber-500",
    text: "text-amber-700",
  },
  UNKNOWN: {
    label: "Desconocido",
    hint: "No se pudo determinar — falta evidencia o el dato no está disponible.",
    dot: "bg-slate-400",
    text: "text-slate-500",
  },
};

const FALLBACK: ProvenanceMeta = { label: "—", hint: "Sin clasificar.", dot: "bg-slate-300", text: "text-slate-400" };

export function provenanceMeta(value: string): ProvenanceMeta {
  return PROVENANCE_META[value as Provenance] ?? FALLBACK;
}
