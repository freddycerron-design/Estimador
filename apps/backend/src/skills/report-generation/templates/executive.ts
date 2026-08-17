import type { EstimationBundle } from "@estimador/shared-types";

/** Plantilla ejecutiva (spec §29): resumen conciso orientado a decisión, sin desglose línea por línea. */
export function renderExecutive(bundle: EstimationBundle): string {
  const { requirement, similarity, estimation, cost, risks, recommendations } = bundle;
  const confidencePct = Math.round(estimation.confidenceScore * 100);
  const refNames = similarity.usableCandidates.map((c) => bundle.referenceProjectNames[c.projectId] ?? c.projectId);

  return `# Estimación Ejecutiva

## Resumen
${requirement.description}

## Estimación
- **Esfuerzo:** ${estimation.effortHoursRange.probable.toLocaleString()} horas (rango ${estimation.effortHoursRange.optimistic.toLocaleString()}–${estimation.effortHoursRange.pessimistic.toLocaleString()})
- **Duración:** ${Math.round(estimation.durationWeeksRange.probable)} semanas (rango ${Math.round(estimation.durationWeeksRange.optimistic)}–${Math.round(estimation.durationWeeksRange.pessimistic)})
- **Costo:** ${cost.currency} ${cost.totalCost.probable.toLocaleString()} (rango ${cost.currency} ${cost.totalCost.optimistic.toLocaleString()}–${cost.totalCost.pessimistic.toLocaleString()})
- **Confianza:** ${confidencePct}% (${confidenceLabel(estimation.confidenceScore)})

## Referencias históricas utilizadas
${refNames.length > 0 ? refNames.map((n) => `- ${n}`).join("\n") : "_Ninguna referencia superó el umbral mínimo de similitud._"}

## Riesgos principales
${risks.length > 0 ? risks.map((r) => `- ${r}`).join("\n") : "_Sin riesgos identificados de forma automática._"}

## Recomendaciones
${recommendations.length > 0 ? recommendations.map((r) => `- ${r}`).join("\n") : "_Ninguna._"}
`;
}

function confidenceLabel(score: number): string {
  if (score >= 0.75) return "Alto";
  if (score >= 0.5) return "Medio";
  return "Bajo";
}
