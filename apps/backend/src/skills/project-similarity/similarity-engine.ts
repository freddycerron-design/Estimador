import type { RequirementFeatures } from "@estimador/shared-types";
import { SIMILARITY_DIMENSIONS, type SimilarityWeights, type DimensionScores } from "@estimador/shared-types";

const COMPLEXITY_ORDER = ["low", "medium", "high", "very_high"] as const;

export interface CandidateFeatures {
  projectType: string;
  industry: string;
  technologies: string[];
  modules: string[];
  integrations: string[];
  numUsers: number | null;
  numInterfaces: number | null;
  complexity: (typeof COMPLEXITY_ORDER)[number] | null;
  semanticSimilarity: number; // 0..1, ya calculado vía embeddings (pgvector)
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a.map((x) => x.toLowerCase().trim()));
  const setB = new Set(b.map((x) => x.toLowerCase().trim()));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function proximityScore(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0.5; // dato faltante: ni penaliza al máximo ni asume coincidencia
  if (a === 0 && b === 0) return 1;
  const diff = Math.abs(a - b);
  const scale = Math.max(a, b, 1);
  return Math.max(0, 1 - diff / scale);
}

function complexityScore(a: CandidateFeatures["complexity"], b: RequirementFeatures["complexity"]): number {
  if (!a || !b) return 0.5;
  const ia = COMPLEXITY_ORDER.indexOf(a);
  const ib = COMPLEXITY_ORDER.indexOf(b);
  if (ia < 0 || ib < 0) return 0.5;
  return 1 - Math.abs(ia - ib) / (COMPLEXITY_ORDER.length - 1);
}

function contextScore(candidate: CandidateFeatures, requirement: RequirementFeatures): number {
  const industryMatch = requirement.industry && candidate.industry.toLowerCase() === requirement.industry.toLowerCase() ? 1 : 0.3;
  const typeMatch = requirement.projectType && candidate.projectType === requirement.projectType ? 1 : 0.3;
  return (industryMatch + typeMatch) / 2;
}

/**
 * Calcula el score de cada una de las 7 dimensiones de similitud (spec §6). El score
 * "functionality" combina similitud semántica (embeddings) con overlap estructurado de
 * módulos — la semántica por sí sola no es una dimensión aparte, es una señal que
 * alimenta la dimensión funcional.
 */
export function scoreDimensions(requirement: RequirementFeatures, candidate: CandidateFeatures): DimensionScores {
  const modulesOverlap = jaccard(requirement.modules, candidate.modules);
  const functionality = 0.6 * candidate.semanticSimilarity + 0.4 * modulesOverlap;

  const technology = jaccard(requirement.technologies, candidate.technologies);
  const complexity = complexityScore(candidate.complexity, requirement.complexity);
  const integrations = proximityScore(requirement.integrations.length, candidate.integrations.length);
  const size = proximityScore(requirement.numUsers, candidate.numUsers);
  const scope = proximityScore(requirement.numInterfaces, candidate.numInterfaces);
  const context = contextScore(candidate, requirement);

  return { functionality, technology, complexity, integrations, size, scope, context } as DimensionScores;
}

export function weightedTotal(scores: DimensionScores, weights: SimilarityWeights): number {
  let total = 0;
  for (const dim of SIMILARITY_DIMENSIONS) {
    total += (scores[dim] ?? 0) * (weights[dim] ?? 0);
  }
  return total;
}

/**
 * Dimensiones con mayor peso configurado que tuvieron score bajo — usadas para explicar
 * diferencias (spec §10) y para decidir qué preguntar al usuario cuando no se supera el umbral.
 */
export function weakestDimensions(scores: DimensionScores, weights: SimilarityWeights, limit = 3): string[] {
  return [...SIMILARITY_DIMENSIONS]
    .map((dim) => ({ dim, score: scores[dim] ?? 0, weight: weights[dim] ?? 0 }))
    .filter((d) => d.weight > 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((d) => d.dim);
}
