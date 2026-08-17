import type { EffortRange, EstimateLineItem, ConfidenceFactors } from "@estimador/shared-types";

export interface ReferenceActuals {
  projectId: string;
  weight: number; // ya normalizado (suma de weights de todas las referencias usables = 1)
  durationWeeks: number;
  /** {phase_id: {role_id: hours}} */
  effortHours: Record<string, Record<string, number>>;
}

/**
 * Estimación ponderada por similitud (spec §16): Estimación = Σ(referencia_i × peso_i).
 * Aplicada a nivel de celda fase×rol, no solo al total — así la fase/rol que solo aparece
 * en algunas referencias queda naturalmente sub-representada en el peso agregado, en vez de
 * inflar artificialmente el promedio con datos de proyectos que no la tuvieron.
 */
export function weightedLineItems(references: ReferenceActuals[]): Map<string, Map<string, number>> {
  const byPhaseRole = new Map<string, Map<string, number>>();

  for (const ref of references) {
    for (const [phaseId, roles] of Object.entries(ref.effortHours)) {
      const roleMap = byPhaseRole.get(phaseId) ?? new Map<string, number>();
      for (const [roleId, hours] of Object.entries(roles)) {
        roleMap.set(roleId, (roleMap.get(roleId) ?? 0) + hours * ref.weight);
      }
      byPhaseRole.set(phaseId, roleMap);
    }
  }

  return byPhaseRole;
}

export function totalHoursOfReference(ref: ReferenceActuals): number {
  let total = 0;
  for (const roles of Object.values(ref.effortHours)) {
    for (const h of Object.values(roles)) total += h;
  }
  return total;
}

/** Coeficiente de variación (desviación estándar / media) de los totales de las referencias. */
export function coefficientOfVariation(totals: number[]): number {
  if (totals.length === 0) return 0;
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  if (mean === 0) return 0;
  if (totals.length === 1) return 0.15; // única referencia: incertidumbre por defecto (spec: "similarity, cantidad de datos")
  const variance = totals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / totals.length;
  return Math.sqrt(variance) / mean;
}

/** Rango optimista/probable/pesimista a partir de un valor central y un coeficiente de dispersión. */
export function rangeFrom(probable: number, cv: number): EffortRange {
  const spread = Math.min(0.5, Math.max(0.1, cv)); // acotado: nunca menos de ±10%, nunca más de ±50%
  return {
    optimistic: Math.round(probable * (1 - spread)),
    probable: Math.round(probable),
    pessimistic: Math.round(probable * (1 + spread)),
  };
}

export function weightedDurationWeeks(references: ReferenceActuals[]): number {
  return references.reduce((sum, ref) => sum + ref.durationWeeks * ref.weight, 0);
}

export function computeConfidenceFactors(
  similarityAvg: number,
  sampleSize: number,
  cv: number,
  infoCompleteness: number
): ConfidenceFactors {
  return { similarityAvg, sampleSize, dispersion: cv, infoCompleteness };
}

export function confidenceScoreFrom(factors: ConfidenceFactors): number {
  const sampleFactor = Math.min(1, factors.sampleSize / 3);
  const dispersionFactor = Math.max(0, 1 - factors.dispersion);
  return Math.max(
    0,
    Math.min(1, factors.similarityAvg * 0.4 + sampleFactor * 0.2 + dispersionFactor * 0.2 + factors.infoCompleteness * 0.2)
  );
}

export function confidenceLevel(score: number): "bajo" | "medio" | "alto" {
  if (score >= 0.75) return "alto";
  if (score >= 0.5) return "medio";
  return "bajo";
}

export function toLineItems(
  byPhaseRole: Map<string, Map<string, number>>,
  phaseName: (id: string) => string,
  roleName: (id: string) => string
): EstimateLineItem[] {
  const items: EstimateLineItem[] = [];
  for (const [phaseId, roles] of byPhaseRole) {
    for (const [roleId, hours] of roles) {
      if (hours <= 0) continue;
      items.push({
        phaseId,
        phaseName: phaseName(phaseId),
        roleId,
        roleName: roleName(roleId),
        hours: Math.round(hours),
        provenance: "CALCULATED",
        sourceNote: "Promedio ponderado por similitud de proyectos históricos de referencia",
      });
    }
  }
  return items.sort((a, b) => b.hours - a.hours);
}
