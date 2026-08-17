import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { SimilarityCandidate } from "@estimador/shared-types";
import { db, unwrap } from "../../db/insforge-client.js";
import type { ProjectFeatureRow } from "../../db/types.js";
import { defineSkill } from "../types.js";

const CandidateSchema = z.object({
  projectId: z.string().uuid(),
  totalSimilarity: z.number(),
  isOutlier: z.boolean(),
  outlierReason: z.string().optional(),
});

const InputSchema = z.object({
  usableCandidates: z.array(CandidateSchema),
});

export interface RiskAnalysisOutput {
  risks: string[];
}

/**
 * Identifica riesgos combinando: (a) riesgos registrados en las referencias históricas usadas,
 * y (b) riesgos estructurales derivados de la propia búsqueda de similitud (outliers descartados,
 * pocas referencias). No usa el LLM — es determinista y trazable.
 */
export const riskAnalysisSkill = defineSkill<{ usableCandidates: SimilarityCandidate[] }, RiskAnalysisOutput>({
  key: "risk-analysis",
  toolName: "analyze_risks",
  description: "Identifica riesgos principales del proyecto en base a riesgos registrados en proyectos históricos similares y a señales de la búsqueda de similitud.",
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(input) {
    const { usableCandidates } = InputSchema.parse(input);
    const risks = new Set<string>();

    if (usableCandidates.length > 0) {
      const ids = usableCandidates.map((c) => c.projectId);
      const featureRows = await unwrap<ProjectFeatureRow[]>(
        "select:project_features:risks",
        db.from("project_features").select().in("project_id", ids).eq("feature_key", "risks")
      );
      for (const row of featureRows) {
        const projectRisks = (row.feature_value as string[] | undefined) ?? [];
        for (const r of projectRisks) risks.add(r);
      }
    }

    if (usableCandidates.length === 1) {
      risks.add("La estimación se basa en una única referencia histórica — mayor incertidumbre que con múltiples referencias.");
    }
    if (usableCandidates.length === 0) {
      risks.add("No hay referencias históricas usables por encima del umbral de similitud — la estimación tendría alta incertidumbre.");
    }

    return { risks: [...risks] };
  },
});
