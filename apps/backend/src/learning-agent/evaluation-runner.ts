import type { EstimationRuleDiff, EvaluationSummary } from "@estimador/shared-types";
import { db, unwrap } from "../db/insforge-client.js";
import type { LearningProposalRow, ProjectRow, ProjectActualRow } from "../db/types.js";
import { getSetting, loadSystemSettings } from "../config/system-settings.js";

function totalHours(effort: Record<string, Record<string, number>>): number {
  let total = 0;
  for (const roles of Object.values(effort)) for (const h of Object.values(roles)) total += h;
  return total;
}

/**
 * Evalúa una propuesta con validación leave-one-out sobre proyectos históricos REALES del
 * mismo tipo (spec §25: "una modificación debe estar respaldada por evidencia"): para cada
 * proyecto, "baseline" = promedio de horas reales de los OTROS proyectos del mismo tipo
 * (lo que estimaría un promedio histórico simple, sin el ajuste propuesto); "adjusted" =
 * baseline × multiplier. Si el ajuste reduce el error promedio contra las horas reales, la
 * evidencia respalda la propuesta.
 */
export async function evaluateProposal(proposalId: string): Promise<EvaluationSummary | null> {
  const proposals = await unwrap<LearningProposalRow[]>("select:learning_proposals:one", db.from("learning_proposals").select().eq("id", proposalId).limit(1));
  const proposal = proposals[0];
  if (!proposal) throw new Error(`Propuesta no encontrada: ${proposalId}`);

  await unwrap("update:learning_proposals:evaluation", db.from("learning_proposals").update({ status: "EVALUATION" }).eq("id", proposalId).select());

  const diff = proposal.diff as unknown as EstimationRuleDiff;
  const projects = await unwrap<ProjectRow[]>(
    "select:projects:by_type",
    db.from("projects").select().eq("project_type", diff.projectType).eq("status", "completed")
  );
  const actuals = await unwrap<ProjectActualRow[]>(
    "select:project_actuals:by_projects",
    projects.length > 0 ? db.from("project_actuals").select().in("project_id", projects.map((p) => p.id)) : db.from("project_actuals").select().eq("project_id", "00000000-0000-0000-0000-000000000000")
  );

  const hoursByProject = new Map(actuals.map((a) => [a.project_id, totalHours(a.actual_effort_hours)]));
  const samples = projects.map((p) => hoursByProject.get(p.id)).filter((h): h is number => h !== undefined && h > 0);

  if (samples.length < 2) {
    const summary: EvaluationSummary = { casesRun: 0, casesImproved: 0, baselineAvgErrorPct: 0, adjustedAvgErrorPct: 0, improvementPct: 0, passed: false };
    await finalizeEvaluation(proposalId, summary, false);
    return summary;
  }

  let baselineErrorSum = 0;
  let adjustedErrorSum = 0;
  let improvedCount = 0;
  const evaluationCaseIds: string[] = [];

  for (let i = 0; i < samples.length; i++) {
    const actualHours = samples[i]!;
    const others = samples.filter((_, idx) => idx !== i);
    const baseline = others.reduce((s, v) => s + v, 0) / others.length;
    const adjusted = baseline * diff.multiplier;

    const baselineError = Math.abs(baseline - actualHours) / actualHours;
    const adjustedError = Math.abs(adjusted - actualHours) / actualHours;
    baselineErrorSum += baselineError;
    adjustedErrorSum += adjustedError;
    if (adjustedError < baselineError) improvedCount++;

    const [evalCase] = await unwrap<{ id: string }[]>(
      "insert:evaluation_cases",
      db
        .from("evaluation_cases")
        .insert([
          {
            name: `leave-one-out:${diff.projectType}:${projects[i]?.name ?? i}`,
            description: `Validación cruzada contra horas reales de "${projects[i]?.name ?? "proyecto histórico"}"`,
            input: { projectType: diff.projectType, baselineHours: Math.round(baseline) },
            expected_output: { actualHours: Math.round(actualHours) },
            category: diff.projectType,
          },
        ])
        .select("id")
    );
    if (evalCase) {
      evaluationCaseIds.push(evalCase.id);
      await unwrap(
        "insert:evaluation_results",
        db
          .from("evaluation_results")
          .insert([
            {
              evaluation_case_id: evalCase.id,
              passed: adjustedError < baselineError,
              actual_output: { baselineHours: Math.round(baseline), adjustedHours: Math.round(adjusted), actualHours: Math.round(actualHours), baselineError, adjustedError },
              score: 1 - adjustedError,
            },
          ])
          .select()
      );
    }
  }

  const baselineAvgErrorPct = Math.round((baselineErrorSum / samples.length) * 1000) / 10;
  const adjustedAvgErrorPct = Math.round((adjustedErrorSum / samples.length) * 1000) / 10;
  const improvementPct = Math.round((baselineAvgErrorPct - adjustedAvgErrorPct) * 10) / 10;

  const settings = await loadSystemSettings();
  const threshold = getSetting(settings, "PROPOSAL_IMPROVEMENT_THRESHOLD_PCT", 5);
  const passed = improvementPct >= threshold;

  const summary: EvaluationSummary = {
    casesRun: samples.length,
    casesImproved: improvedCount,
    baselineAvgErrorPct,
    adjustedAvgErrorPct,
    improvementPct,
    passed,
  };

  await finalizeEvaluation(proposalId, summary, passed);
  return summary;
}

async function finalizeEvaluation(proposalId: string, summary: EvaluationSummary, passed: boolean): Promise<void> {
  await unwrap(
    "update:learning_proposals:finalize",
    db
      .from("learning_proposals")
      .update({
        status: passed ? "PENDING_APPROVAL" : "REJECTED",
        evaluation_summary: summary,
        submitted_for_approval_at: passed ? new Date().toISOString() : null,
      })
      .eq("id", proposalId)
      .select()
  );
}
