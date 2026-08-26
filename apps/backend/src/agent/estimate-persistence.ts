import type { EstimationBundle, EstimationParameters } from "@estimador/shared-types";
import { db, unwrap } from "../db/insforge-client.js";

/**
 * Persiste el resultado de una estimación (project_estimates + estimate_line_items +
 * reference_projects) en el momento en que se genera el reporte final — hasta este punto
 * el resultado solo vivía en el bundle en memoria. Sin esto, feedback/actuals/Learning Agent
 * no tendrían nada contra qué comparar (spec §18-20).
 */
export async function persistEstimate(
  conversationId: string,
  template: string,
  bundle: EstimationBundle,
  parameters: EstimationParameters,
  includedRoleIds: string[] | null
): Promise<string> {
  // El proyecto NUEVO que se está estimando también necesita su propia fila en `projects`
  // (status='active_estimate') — sin esto no hay dónde enganchar `project_actuals` cuando
  // el proyecto termine y se quiera comparar estimación vs. real (spec Criterio 6).
  const [newProject] = await unwrap<{ id: string }[]>(
    "insert:projects:active_estimate",
    db
      .from("projects")
      .insert([
        {
          name: bundle.requirement.description.slice(0, 120),
          description: bundle.requirement.description,
          project_type: bundle.requirement.projectType ?? "unknown",
          industry: bundle.requirement.industry,
          technologies: bundle.requirement.technologies,
          team_size: null,
          duration_weeks: bundle.estimation.durationWeeksRange.probable,
          actual_cost: null,
          status: "active_estimate",
          source: "real",
        },
      ])
      .select("id")
  );
  if (!newProject) throw new Error("No se pudo crear la fila de projects para el nuevo proyecto estimado");
  const newProjectId = newProject.id;

  if (bundle.requirement.modules.length || bundle.requirement.integrations.length || bundle.requirement.numUsers !== null) {
    await unwrap(
      "insert:project_features:active_estimate",
      db
        .from("project_features")
        .insert([
          { project_id: newProjectId, category: "functional", feature_key: "modules", feature_value: bundle.requirement.modules, extracted_by: "agent", provenance: "FACTUAL" },
          { project_id: newProjectId, category: "integration", feature_key: "integrations", feature_value: bundle.requirement.integrations, extracted_by: "agent", provenance: "FACTUAL" },
          { project_id: newProjectId, category: "functional", feature_key: "num_users", feature_value: bundle.requirement.numUsers, extracted_by: "agent", provenance: bundle.requirement.numUsers !== null ? "FACTUAL" : "UNKNOWN" },
        ])
        .select()
    );
  }

  const [estimateRow] = await unwrap<{ id: string }[]>(
    "insert:project_estimates",
    db
      .from("project_estimates")
      .insert([
        {
          project_id: newProjectId,
          conversation_id: conversationId,
          template_used: template,
          status: "final",
          duration_weeks_optimistic: bundle.estimation.durationWeeksRange.optimistic,
          duration_weeks_probable: bundle.estimation.durationWeeksRange.probable,
          duration_weeks_pessimistic: bundle.estimation.durationWeeksRange.pessimistic,
          cost_optimistic: bundle.cost.totalCost.optimistic,
          cost_probable: bundle.cost.totalCost.probable,
          cost_pessimistic: bundle.cost.totalCost.pessimistic,
          currency: bundle.cost.currency,
          confidence_score: bundle.estimation.confidenceScore,
          confidence_factors: bundle.estimation.confidenceFactors,
          similarity_threshold_met: bundle.similarity.referenceFound,
          skill_versions_used: null, // TODO: propagar ids de skill_versions activas usadas (Fase 9, Learning Agent)
          risks: bundle.risks,
          recommendations: bundle.recommendations,
          // Snapshot de los 5 parámetros de estimación efectivamente usados (merge final override+global)
          // — congelado con trazabilidad real, para feedback futuro y para precargar "Refinar estimación".
          parameters,
          // Roles efectivamente incluidos en el desglose — mismo criterio, congelado para refinamiento.
          included_role_ids: includedRoleIds,
        },
      ])
      .select("id")
  );
  if (!estimateRow) throw new Error("No se pudo persistir project_estimates");
  const estimateId = estimateRow.id;

  if (bundle.estimation.lineItems.length > 0) {
    await unwrap(
      "insert:estimate_line_items",
      db
        .from("estimate_line_items")
        .insert(
          bundle.estimation.lineItems.map((li) => ({
            estimate_id: estimateId,
            phase_id: li.phaseId,
            role_id: li.roleId,
            hours: li.hours,
            provenance: li.provenance,
            source_note: li.sourceNote ?? null,
          }))
        )
        .select()
    );
  }

  if (bundle.similarity.usableCandidates.length > 0) {
    await unwrap(
      "insert:reference_projects",
      db
        .from("reference_projects")
        .insert(
          bundle.similarity.usableCandidates.map((c) => ({
            estimate_id: estimateId,
            reference_project_id: c.projectId,
            similarity_score: c.totalSimilarity,
            similarity_breakdown: c.dimensionScores,
            weight_applied: c.totalSimilarity / bundle.similarity.usableCandidates.reduce((s, u) => s + u.totalSimilarity, 0),
            is_outlier: c.isOutlier,
            outlier_reason: c.outlierReason ?? null,
          }))
        )
        .select()
    );
  }

  return estimateId;
}
