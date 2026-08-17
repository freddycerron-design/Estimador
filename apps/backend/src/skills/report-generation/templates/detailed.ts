import type { EstimationBundle } from "@estimador/shared-types";

const DIMENSION_LABELS: Record<string, string> = {
  functionality: "Funcionalidad",
  technology: "Tecnología",
  complexity: "Complejidad",
  integrations: "Integraciones",
  size: "Tamaño",
  scope: "Alcance",
  context: "Contexto",
};

/** Plantilla detallada (spec §29-30): incluye desglose por fase/rol, similitud explicada y trazabilidad completa. */
export function renderDetailed(bundle: EstimationBundle): string {
  const { requirement, similarity, estimation, cost, risks, recommendations } = bundle;
  const confidencePct = Math.round(estimation.confidenceScore * 100);

  const referencesSection = similarity.usableCandidates
    .map((c) => {
      const name = bundle.referenceProjectNames[c.projectId] ?? c.projectId;
      const dims = Object.entries(c.dimensionScores)
        .map(([dim, score]) => `  - ${DIMENSION_LABELS[dim] ?? dim}: ${Math.round(score * 100)}%`)
        .join("\n");
      return `### ${name} — Similitud: ${Math.round(c.totalSimilarity * 100)}%\n${dims}`;
    })
    .join("\n\n");

  const excludedSection = similarity.candidates
    .filter((c) => !similarity.usableCandidates.includes(c))
    .map((c) => {
      const name = bundle.referenceProjectNames[c.projectId] ?? c.projectId;
      const reason = c.isOutlier ? `outlier: ${c.outlierReason}` : `similitud ${Math.round(c.totalSimilarity * 100)}% por debajo del umbral (${Math.round(similarity.threshold * 100)}%)`;
      return `- ${name} — descartado (${reason})`;
    })
    .join("\n");

  const lineItemsTable = estimation.lineItems
    .map((li) => `| ${li.phaseName} | ${li.roleName} | ${li.hours} | ${li.provenance} |`)
    .join("\n");

  const costTable = cost.byRole.map((c) => `| ${c.roleName} | ${c.hours} | ${cost.currency} ${c.ratePerHour} | ${cost.currency} ${c.cost.toLocaleString()} |`).join("\n");

  return `# Estimación Detallada

## Resumen Ejecutivo
${requirement.description}

**Tipo de proyecto:** ${requirement.projectType ?? "no determinado"} · **Industria:** ${requirement.industry ?? "no determinada"} · **Complejidad:** ${requirement.complexity ?? "no determinada"}
**Tecnologías:** ${requirement.technologies.join(", ") || "no especificadas"}
**Módulos:** ${requirement.modules.join(", ") || "no especificados"}
**Integraciones:** ${requirement.integrations.join(", ") || "no especificadas"}

## Referencias Históricas Utilizadas (similitud ≥ ${Math.round(similarity.threshold * 100)}%)
${referencesSection || "_Ninguna referencia superó el umbral mínimo de similitud — ver sección de información faltante._"}

${excludedSection ? `## Candidatos Evaluados y Descartados\n${excludedSection}\n` : ""}

## Información Faltante
${similarity.missingInformation.length > 0 ? similarity.missingInformation.map((m) => `- ${m}`).join("\n") : "_Ninguna — información suficiente para la estimación._"}

## Supuestos
${estimation.assumptions.map((a) => `- ${a}`).join("\n")}

## Estimación de Esfuerzo por Fase y Rol
| Fase | Rol | Horas | Procedencia |
|---|---|---|---|
${lineItemsTable}

**Total:** ${estimation.effortHoursRange.probable.toLocaleString()} horas (rango ${estimation.effortHoursRange.optimistic.toLocaleString()}–${estimation.effortHoursRange.pessimistic.toLocaleString()})
**Duración:** ${Math.round(estimation.durationWeeksRange.probable)} semanas (rango ${Math.round(estimation.durationWeeksRange.optimistic)}–${Math.round(estimation.durationWeeksRange.pessimistic)})

## Costos
| Rol | Horas | Tarifa | Costo |
|---|---|---|---|
${costTable}

- Costo de mano de obra: ${cost.currency} ${cost.laborCost.toLocaleString()}
- Overhead (${Math.round(cost.overheadPct * 100)}%): ${cost.currency} ${cost.overheadCost.toLocaleString()}
- Contingencia (${Math.round(cost.contingencyPct * 100)}%): ${cost.currency} ${cost.contingencyCost.toLocaleString()}
- **Total (probable):** ${cost.currency} ${cost.totalCost.probable.toLocaleString()} (rango ${cost.currency} ${cost.totalCost.optimistic.toLocaleString()}–${cost.currency} ${cost.totalCost.pessimistic.toLocaleString()})

## Riesgos
${risks.length > 0 ? risks.map((r) => `- ${r}`).join("\n") : "_Sin riesgos identificados de forma automática._"}

## Confianza
**${confidencePct}%** — similitud promedio ${Math.round(estimation.confidenceFactors.similarityAvg * 100)}%, ${estimation.confidenceFactors.sampleSize} referencia(s), dispersión ${Math.round(estimation.confidenceFactors.dispersion * 100)}%, completitud de información ${Math.round(estimation.confidenceFactors.infoCompleteness * 100)}%.

## Recomendaciones
${recommendations.length > 0 ? recommendations.map((r) => `- ${r}`).join("\n") : "_Ninguna._"}
`;
}
