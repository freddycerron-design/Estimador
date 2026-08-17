import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { RequirementFeatures, SimilarityResult, SimilarityCandidate, SimilarityWeights } from "@estimador/shared-types";
import { db, rpc, unwrap } from "../../db/insforge-client.js";
import type { MatchProjectsRow, ProjectRow, ProjectFeatureRow, ProjectActualRow, SimilarityWeightProfileRow } from "../../db/types.js";
import { defineSkill } from "../types.js";
import { getSetting } from "../../config/system-settings.js";
import { scoreDimensions, weightedTotal, weakestDimensions, type CandidateFeatures } from "./similarity-engine.js";
import { detectOutliers } from "./outlier-detection.js";

const InputSchema = z.object({
  projectType: z.string().nullable(),
  industry: z.string().nullable(),
  technologies: z.array(z.string()),
  modules: z.array(z.string()),
  integrations: z.array(z.string()),
  numUsers: z.number().nullable(),
  numInterfaces: z.number().nullable(),
  complexity: z.enum(["low", "medium", "high", "very_high"]).nullable(),
  description: z.string(),
  missingInformation: z.array(z.string()).default([]),
  /** Si viene de una conversación existente, persiste la auditoría de candidatos ahí. */
  conversationId: z.string().uuid().optional(),
});

function projectFeatureValue<T>(features: ProjectFeatureRow[], key: string, fallback: T): T {
  const row = features.find((f) => f.feature_key === key);
  return row ? (row.feature_value as T) : fallback;
}

export const projectSimilaritySkill = defineSkill<RequirementFeatures & { conversationId?: string }, SimilarityResult>({
  key: "project-similarity",
  toolName: "search_similar_projects",
  description:
    "Busca proyectos históricos similares al requerimiento actual usando embeddings semánticos + atributos estructurados, calcula el % de similitud multi-dimensional de cada candidato, aplica el umbral mínimo configurado y explica qué información falta si ningún candidato es suficientemente similar.",
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(input, ctx) {
    const requirement = InputSchema.parse(input);
    const threshold = getSetting(ctx.settings, "MIN_SIMILARITY_THRESHOLD", 0.75);
    const candidateLimit = (ctx.config.candidateLimit as number | undefined) ?? 10;
    const outlierZ = getSetting(ctx.settings, "OUTLIER_ZSCORE_THRESHOLD", 2.5);

    const weightProfile = await unwrap<SimilarityWeightProfileRow[]>(
      "select:similarity_weight_profiles:active",
      db.from("similarity_weight_profiles").select().eq("is_active", true).limit(1)
    );
    const weights = (weightProfile[0]?.weights ?? {}) as SimilarityWeights;

    const embeddingText = [
      requirement.description,
      requirement.projectType ? `Tipo: ${requirement.projectType}` : "",
      requirement.technologies.length ? `Tecnologías: ${requirement.technologies.join(", ")}` : "",
      requirement.modules.length ? `Módulos: ${requirement.modules.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const queryEmbedding = await ctx.embed(embeddingText);

    const semanticMatches = await rpc<MatchProjectsRow[]>("match_projects", {
      query_embedding: queryEmbedding,
      match_count: candidateLimit,
      filter_status: "completed",
    });

    if (semanticMatches.length === 0) {
      return emptyResult(threshold, requirement);
    }

    const candidateIds = semanticMatches.map((m) => m.id);
    const [projects, features, actuals] = await Promise.all([
      unwrap<ProjectRow[]>("select:projects:candidates", db.from("projects").select().in("id", candidateIds)),
      unwrap<ProjectFeatureRow[]>("select:project_features:candidates", db.from("project_features").select().in("project_id", candidateIds)),
      unwrap<ProjectActualRow[]>("select:project_actuals:candidates", db.from("project_actuals").select().in("project_id", candidateIds)),
    ]);

    const projectById = new Map(projects.map((p) => [p.id, p]));
    const featuresByProject = new Map<string, ProjectFeatureRow[]>();
    for (const f of features) {
      const list = featuresByProject.get(f.project_id) ?? [];
      list.push(f);
      featuresByProject.set(f.project_id, list);
    }
    const totalHoursByProject = new Map<string, number>();
    for (const a of actuals) {
      const hoursByPhase = a.actual_effort_hours ?? {};
      let total = 0;
      for (const roles of Object.values(hoursByPhase)) {
        for (const h of Object.values(roles)) total += h;
      }
      totalHoursByProject.set(a.project_id, total);
    }

    const scored = semanticMatches
      .map((match) => {
        const project = projectById.get(match.id);
        if (!project) return null;
        const projFeatures = featuresByProject.get(match.id) ?? [];
        const candidateFeatures: CandidateFeatures = {
          projectType: project.project_type,
          industry: project.industry ?? "",
          technologies: project.technologies,
          modules: projectFeatureValue(projFeatures, "modules", []),
          integrations: projectFeatureValue(projFeatures, "integrations", []),
          numUsers: projectFeatureValue(projFeatures, "num_users", null),
          numInterfaces: projectFeatureValue(projFeatures, "num_interfaces", null),
          complexity: projectFeatureValue(projFeatures, "complexity", null),
          semanticSimilarity: match.semantic_similarity,
        };
        const dimensionScores = scoreDimensions(requirement, candidateFeatures);
        const totalSimilarity = weightedTotal(dimensionScores, weights);
        return { project, dimensionScores, totalSimilarity };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.totalSimilarity - a.totalSimilarity);

    const totalHoursSeries = scored.map((s) => totalHoursByProject.get(s.project.id) ?? 0);
    const outlierFlags = detectOutliers(totalHoursSeries, outlierZ);

    const candidates: SimilarityCandidate[] = scored.map((s, i) => ({
      projectId: s.project.id,
      totalSimilarity: s.totalSimilarity,
      dimensionScores: s.dimensionScores,
      isOutlier: outlierFlags[i]?.isOutlier ?? false,
      outlierReason: outlierFlags[i]?.reason,
    }));

    // Auditoría: persistir TODOS los candidatos evaluados, no solo los usables (spec §5).
    if (requirement.conversationId) {
      await unwrap(
        "insert:similarity_results",
        db
          .from("similarity_results")
          .insert(
            candidates.map((c) => ({
              conversation_id: requirement.conversationId,
              candidate_project_id: c.projectId,
              total_similarity: c.totalSimilarity,
              dimension_scores: c.dimensionScores,
              weight_profile_id: weightProfile[0]?.id ?? null,
            }))
          )
          .select()
      );
    }

    const usableCandidates = candidates.filter((c) => c.totalSimilarity >= threshold && !c.isOutlier);
    const bestSimilarity = candidates[0]?.totalSimilarity ?? 0;
    const referenceFound = usableCandidates.length > 0;

    const missingInformation = [...requirement.missingInformation];
    if (!referenceFound && candidates[0]) {
      const weakDims = weakestDimensions(candidates[0].dimensionScores, weights);
      for (const dim of weakDims) missingInformation.push(...missingInfoForDimension(dim, requirement));
    }

    const confidence = computeConfidence(usableCandidates, missingInformation.length);

    return {
      referenceFound,
      threshold,
      bestSimilarity,
      candidates,
      usableCandidates,
      missingInformation: [...new Set(missingInformation)],
      confidence,
    };
  },
});

function emptyResult(threshold: number, requirement: RequirementFeatures): SimilarityResult {
  return {
    referenceFound: false,
    threshold,
    bestSimilarity: 0,
    candidates: [],
    usableCandidates: [],
    missingInformation: [
      ...requirement.missingInformation,
      "No se encontró ningún proyecto histórico ni remotamente relacionado — se necesita más detalle del requerimiento.",
    ],
    confidence: 0,
  };
}

function missingInfoForDimension(dimension: string, requirement: RequirementFeatures): string[] {
  switch (dimension) {
    case "integrations":
      return ["¿Cuántas integraciones tendrá la solución y con qué sistemas?"];
    case "size":
      return requirement.numUsers === null ? ["¿Cuántos usuarios tendrá aproximadamente?"] : [];
    case "scope":
      return requirement.numInterfaces === null ? ["¿Cuántas interfaces/pantallas o sistemas externos toca la solución?"] : [];
    case "technology":
      return requirement.technologies.length === 0 ? ["¿Existe una arquitectura tecnológica definida o preferida?"] : [];
    case "complexity":
      return requirement.complexity === null ? ["¿Cómo describirías la complejidad del proyecto (baja/media/alta/muy alta)?"] : [];
    case "functionality":
      return requirement.modules.length === 0 ? ["¿Cuáles son los módulos o funcionalidades principales esperadas?"] : [];
    default:
      return [];
  }
}

function computeConfidence(usableCandidates: SimilarityCandidate[], missingCount: number): number {
  if (usableCandidates.length === 0) return 0;
  const avgSimilarity = usableCandidates.reduce((sum, c) => sum + c.totalSimilarity, 0) / usableCandidates.length;
  const sampleFactor = Math.min(1, usableCandidates.length / 3); // 3+ referencias = factor pleno
  const infoFactor = Math.max(0, 1 - missingCount * 0.1);
  return Math.max(0, Math.min(1, avgSimilarity * 0.6 + sampleFactor * 0.25 + infoFactor * 0.15));
}
