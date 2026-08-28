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

/**
 * Filtra los roles de cada referencia ANTES de ponderar (spec pedido por usuario: elegir qué
 * roles participan en la estimación). Se aplica acá, no después sobre `lineItems`, para que la
 * dispersión/confianza (`totalHoursOfReference`, coeficiente de variación) también reflejen solo
 * los roles incluidos — comparar "horas totales con QA excluido" contra referencias que sí
 * incluían QA sería una comparación inconsistente.
 */
export function filterReferencesByRoles(references: ReferenceActuals[], includedRoleIds: string[] | null | undefined): ReferenceActuals[] {
  if (!includedRoleIds || includedRoleIds.length === 0) return references; // sin selección = sin filtrar, comportamiento actual
  const included = new Set(includedRoleIds);
  return references.map((ref) => ({
    ...ref,
    effortHours: Object.fromEntries(
      Object.entries(ref.effortHours).map(([phaseId, roles]) => [phaseId, Object.fromEntries(Object.entries(roles).filter(([roleId]) => included.has(roleId)))])
    ),
  }));
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

/** % de dedicación asumido cuando un rol no tiene tarifa/asignación configurada (no debería pasar en uso normal). */
export const DEFAULT_ALLOCATION_PCT = 1;

/**
 * Roles que el usuario incluyó explícitamente pero que NO tienen NINGUNA hora histórica ponderada
 * (rol nuevo en el catálogo, o ninguna referencia usable lo empleó) no pueden estimarse por
 * promedio histórico — spec pedido por usuario: el % de asignación de cada rol (no siempre 100%)
 * debe considerarse en el cálculo. Se estima "top-down": horas = semanas probables del proyecto ×
 * horas/semana estándar × % de asignación configurado del rol, marcado explícitamente como
 * ASSUMPTION (nunca se presenta como si viniera de datos reales).
 */
export function fillMissingRolesFromAllocation(
  lineItems: EstimateLineItem[],
  includedRoleIds: string[] | null | undefined,
  probableWeeks: number,
  standardWeeklyHours: number,
  allocationPctByRole: Map<string, number>,
  fallbackPhaseId: string | undefined,
  fallbackPhaseName: string,
  roleName: (id: string) => string
): { lineItems: EstimateLineItem[]; addedRoleNames: string[] } {
  if (!includedRoleIds || includedRoleIds.length === 0 || !fallbackPhaseId) {
    return { lineItems, addedRoleNames: [] };
  }
  const rolesWithHours = new Set(lineItems.map((li) => li.roleId));
  const missing = includedRoleIds.filter((id) => !rolesWithHours.has(id));
  if (missing.length === 0) return { lineItems, addedRoleNames: [] };

  const weeksBasis = probableWeeks > 0 ? probableWeeks : 1;
  const added: EstimateLineItem[] = missing.map((roleId) => {
    const pct = allocationPctByRole.get(roleId) ?? DEFAULT_ALLOCATION_PCT;
    const hours = Math.max(1, Math.round(weeksBasis * standardWeeklyHours * pct));
    return {
      phaseId: fallbackPhaseId,
      phaseName: fallbackPhaseName,
      roleId,
      roleName: roleName(roleId),
      hours,
      provenance: "ASSUMPTION" as const,
      sourceNote: `Sin datos históricos para este rol en las referencias usadas — estimado a partir de la duración probable del proyecto (${weeksBasis.toFixed(1)} semanas) y su % de asignación configurado (${Math.round(pct * 100)}%).`,
    };
  });

  return { lineItems: [...lineItems, ...added].sort((a, b) => b.hours - a.hours), addedRoleNames: added.map((a) => a.roleName) };
}

/**
 * Si algún rol necesita más semanas de calendario que las estimadas para completar sus horas a su
 * % de asignación configurado (p. ej. un rol al 25% con 200 horas necesita 12.5 semanas, no las 8
 * "probables" del historial), la duración probable se extiende hasta ese mínimo — un rol de baja
 * dedicación no puede completar su trabajo más rápido que su disponibilidad real.
 */
export function applyAllocationDurationBottleneck(
  probableWeeks: number,
  lineItems: EstimateLineItem[],
  standardWeeklyHours: number,
  allocationPctByRole: Map<string, number>,
  roleName: (id: string) => string
): { weeks: number; note: string | null } {
  const hoursByRole = new Map<string, number>();
  for (const li of lineItems) hoursByRole.set(li.roleId, (hoursByRole.get(li.roleId) ?? 0) + li.hours);

  let bottleneckWeeks = probableWeeks;
  let bottleneckRoleId: string | null = null;
  for (const [roleId, hours] of hoursByRole) {
    const pct = allocationPctByRole.get(roleId) ?? DEFAULT_ALLOCATION_PCT;
    if (pct <= 0) continue;
    const weeksNeeded = hours / (standardWeeklyHours * pct);
    if (weeksNeeded > bottleneckWeeks) {
      bottleneckWeeks = weeksNeeded;
      bottleneckRoleId = roleId;
    }
  }

  if (!bottleneckRoleId) return { weeks: probableWeeks, note: null };
  const pct = allocationPctByRole.get(bottleneckRoleId) ?? DEFAULT_ALLOCATION_PCT;
  return {
    weeks: bottleneckWeeks,
    note: `La duración probable se ajustó de ${probableWeeks.toFixed(1)} a ${bottleneckWeeks.toFixed(1)} semanas: el rol "${roleName(bottleneckRoleId)}" está asignado solo al ${Math.round(pct * 100)}% y no puede completar sus horas estimadas dentro del plazo histórico original.`,
  };
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
