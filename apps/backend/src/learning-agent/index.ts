import { runPatternDetection } from "./pattern-detector.js";
import { generateProposals } from "./proposal-generator.js";
import { evaluateProposal } from "./evaluation-runner.js";
import type { DetectedPattern, EvaluationSummary } from "@estimador/shared-types";

export interface LearningCycleResult {
  patterns: DetectedPattern[];
  proposalIds: string[];
  evaluations: { proposalId: string; summary: EvaluationSummary | null }[];
}

/**
 * Ciclo completo del Learning Agent (spec §19, §25), invocable manualmente (`POST /learning/run`)
 * o por cron. Proceso separado del agente conversacional — no comparte su loop ni sus tools.
 * Termina en PENDING_APPROVAL como máximo; activar una propuesta siempre requiere una acción
 * humana explícita posterior (`proposal-state-machine.ts::approveProposal/activateProposal`).
 */
export async function runLearningCycle(): Promise<LearningCycleResult> {
  const patterns = await runPatternDetection();
  const proposalIds = await generateProposals();

  const evaluations: { proposalId: string; summary: EvaluationSummary | null }[] = [];
  for (const proposalId of proposalIds) {
    const summary = await evaluateProposal(proposalId);
    evaluations.push({ proposalId, summary });
  }

  return { patterns, proposalIds, evaluations };
}
