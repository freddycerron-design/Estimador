import type { EstimationBundle, RequirementFeatures, SimilarityResult, EstimationOutput, CostBreakdown } from "@estimador/shared-types";
import { db, unwrap } from "../db/insforge-client.js";
import type { ToolTraceEntry } from "./orchestrator.js";

/**
 * `generate_report` NO debe depender de que el LLM reconstruya a mano el JSON completo del
 * bundle (similitud, estimación, costos...) desde su memoria de conversación — es frágil y
 * propenso a errores de forma/campos. En su lugar, el backend ensambla el bundle real a partir
 * de los outputs ya persistidos de las tools que se ejecutaron en este turno.
 */
export async function assembleBundleFromTrace(toolTrace: ToolTraceEntry[]): Promise<EstimationBundle | null> {
  const requirement = lastOutput<RequirementFeatures>(toolTrace, "analyze_requirement");
  const similarity = lastOutput<SimilarityResult>(toolTrace, "search_similar_projects");
  const estimation = lastOutput<EstimationOutput>(toolTrace, "estimate_effort_duration");
  const cost = lastOutput<CostBreakdown>(toolTrace, "calculate_cost");
  const risksOutput = lastOutput<{ risks: string[] }>(toolTrace, "analyze_risks");

  if (!requirement || !similarity || !estimation || !cost) return null;

  const projectIds = similarity.usableCandidates.map((c) => c.projectId);
  const referenceProjectNames: Record<string, string> = {};
  if (projectIds.length > 0) {
    const projects = await unwrap<{ id: string; name: string }[]>(
      "select:projects:names",
      db.from("projects").select("id, name").in("id", projectIds)
    );
    for (const p of projects) referenceProjectNames[p.id] = p.name;
  }

  return {
    requirement,
    similarity,
    referenceProjectNames,
    estimation,
    cost,
    risks: risksOutput?.risks ?? [],
    recommendations: similarity.missingInformation,
  };
}

function lastOutput<T>(toolTrace: ToolTraceEntry[], toolName: string): T | null {
  for (let i = toolTrace.length - 1; i >= 0; i--) {
    const entry = toolTrace[i];
    if (entry && entry.toolName === toolName && !entry.error) return entry.output as T;
  }
  return null;
}
