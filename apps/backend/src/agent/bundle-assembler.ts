import type { EstimationBundle, RequirementFeatures, SimilarityResult, EstimationOutput, CostBreakdown } from "@estimador/shared-types";
import { db, unwrap } from "../db/insforge-client.js";
import type { ToolTraceEntry } from "./orchestrator.js";

const REQUIRED_TOOLS = ["analyze_requirement", "search_similar_projects", "estimate_effort_duration", "calculate_cost"] as const;

/**
 * `generate_report` NO debe depender de que el LLM reconstruya a mano el JSON completo del
 * bundle (similitud, estimación, costos...) desde su memoria de conversación — es frágil y
 * propenso a errores de forma/campos. En su lugar, el backend ensambla el bundle real a partir
 * de los outputs ya ejecutados.
 *
 * `historicalOutputs` (spec: bug reportado por usuario — ver `tool-history-cache.ts`) es el
 * respaldo por si el modelo no volvió a ejecutar alguna de las 4 tools requeridas EN ESTE turno:
 * se usa el resultado exitoso más reciente de esa tool en TODA la conversación, no solo el de
 * este mensaje. El resultado de este turno (`toolTrace`) siempre gana si existe — el histórico
 * es solo un respaldo, no reemplaza un dato más fresco.
 */
export async function assembleBundleFromTrace(toolTrace: ToolTraceEntry[], historicalOutputs?: Map<string, unknown>): Promise<EstimationBundle | null> {
  const requirement = resolveOutput<RequirementFeatures>(toolTrace, historicalOutputs, "analyze_requirement");
  const similarity = resolveOutput<SimilarityResult>(toolTrace, historicalOutputs, "search_similar_projects");
  const estimation = resolveOutput<EstimationOutput>(toolTrace, historicalOutputs, "estimate_effort_duration");
  const cost = resolveOutput<CostBreakdown>(toolTrace, historicalOutputs, "calculate_cost");
  const risksOutput = resolveOutput<{ risks: string[] }>(toolTrace, historicalOutputs, "analyze_risks");

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

function resolveOutput<T>(toolTrace: ToolTraceEntry[], historicalOutputs: Map<string, unknown> | undefined, toolName: string): T | null {
  return lastOutput<T>(toolTrace, toolName) ?? ((historicalOutputs?.get(toolName) as T | undefined) ?? null);
}

/**
 * Para el mensaje de error de `generate_report` cuando ni el turno actual ni el histórico
 * alcanzan — le dice al modelo exactamente qué le falta, en vez de solo que "algo" falta.
 */
export function missingRequiredTools(toolTrace: ToolTraceEntry[], historicalOutputs?: Map<string, unknown>): string[] {
  return REQUIRED_TOOLS.filter((name) => resolveOutput(toolTrace, historicalOutputs, name) === null);
}
