import { z } from "zod";

/** Dimensiones de similitud multi-dimensional (spec §6). Los pesos son configurables (similarity_weight_profiles), nunca hardcodeados. */
export const SIMILARITY_DIMENSIONS = [
  "functionality",
  "technology",
  "complexity",
  "integrations",
  "size",
  "scope",
  "context",
] as const;

export const SimilarityDimensionSchema = z.enum(SIMILARITY_DIMENSIONS);
export type SimilarityDimension = z.infer<typeof SimilarityDimensionSchema>;

export const SimilarityWeightsSchema = z
  .object(
    Object.fromEntries(
      SIMILARITY_DIMENSIONS.map((d) => [d, z.number().min(0).max(1)])
    ) as Record<SimilarityDimension, z.ZodNumber>
  )
  .refine(
    (weights) => {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      return Math.abs(sum - 1) < 1e-6;
    },
    { message: "Los pesos de similitud deben sumar 1.0" }
  );
export type SimilarityWeights = z.infer<typeof SimilarityWeightsSchema>;

export const DimensionScoresSchema = z.record(
  SimilarityDimensionSchema,
  z.number().min(0).max(1)
);
export type DimensionScores = z.infer<typeof DimensionScoresSchema>;

export interface SimilarityCandidate {
  projectId: string;
  totalSimilarity: number;
  dimensionScores: DimensionScores;
  isOutlier: boolean;
  outlierReason?: string;
}

export interface SimilarityResult {
  referenceFound: boolean;
  threshold: number;
  bestSimilarity: number;
  candidates: SimilarityCandidate[];
  usableCandidates: SimilarityCandidate[];
  missingInformation: string[];
  confidence: number;
}
