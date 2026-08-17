import type { EstimationRuleDiff } from "@estimador/shared-types";
import { db, unwrap, unwrapNullable } from "../db/insforge-client.js";
import type { LearningProposalRow } from "../db/types.js";
import { invalidateEstimationRulesCache } from "../config/estimation-rules.js";

/**
 * DRAFT → EVALUATION (evaluation-runner) → PENDING_APPROVAL → APPROVED → ACTIVE.
 * `approveProposal` y `activateProposal` son las DOS únicas rutas de código que avanzan una
 * propuesta más allá de PENDING_APPROVAL, y ambas requieren `userId` explícito de un humano
 * autenticado — no existe ningún camino automático a ACTIVE (spec §25).
 */

export async function approveProposal(proposalId: string, userId: string): Promise<LearningProposalRow> {
  const proposal = await requireProposal(proposalId);
  if (proposal.status !== "PENDING_APPROVAL") {
    throw new Error(`La propuesta debe estar en PENDING_APPROVAL para aprobarse (está en ${proposal.status})`);
  }
  const [updated] = await unwrap<LearningProposalRow[]>(
    "update:learning_proposals:approve",
    db.from("learning_proposals").update({ status: "APPROVED", approved_by: userId, approved_at: new Date().toISOString() }).eq("id", proposalId).select()
  );
  if (!updated) throw new Error("No se pudo aprobar la propuesta");
  return updated;
}

export async function activateProposal(proposalId: string, userId: string): Promise<{ proposal: LearningProposalRow; estimationRuleId: string }> {
  const proposal = await requireProposal(proposalId);
  if (proposal.status !== "APPROVED") {
    throw new Error(`La propuesta debe estar APPROVED para activarse (está en ${proposal.status})`);
  }

  const diff = proposal.diff as unknown as EstimationRuleDiff;

  // Desactivar cualquier regla previamente activa con el mismo nombre — nunca queda más de
  // una versión activa a la vez para la misma combinación tipo de proyecto + tipo de regla.
  await unwrap(
    "deprecate:estimation_rules",
    db.from("estimation_rules").update({ status: "deprecated" }).eq("name", diff.ruleName).eq("status", "active").select()
  );

  const previousVersions = await unwrap<{ version: number }[]>(
    "select:estimation_rules:versions",
    db.from("estimation_rules").select("version").eq("name", diff.ruleName).order("version", { ascending: false }).limit(1)
  );
  const nextVersion = (previousVersions[0]?.version ?? 0) + 1;

  const [rule] = await unwrap<{ id: string }[]>(
    "insert:estimation_rules",
    db
      .from("estimation_rules")
      .insert([
        {
          name: diff.ruleName,
          rule_type: diff.ruleType,
          definition: diff,
          version: nextVersion,
          status: "active",
          created_by: null,
          approved_by: userId,
          activated_at: new Date().toISOString(),
        },
      ])
      .select("id")
  );
  if (!rule) throw new Error("No se pudo crear la nueva estimation_rules activa");

  const [updatedProposal] = await unwrap<LearningProposalRow[]>(
    "update:learning_proposals:activate",
    db
      .from("learning_proposals")
      .update({ status: "ACTIVE", target_estimation_rule_id: rule.id, activated_at: new Date().toISOString() })
      .eq("id", proposalId)
      .select()
  );
  if (!updatedProposal) throw new Error("No se pudo marcar la propuesta como ACTIVE");

  invalidateEstimationRulesCache();
  return { proposal: updatedProposal, estimationRuleId: rule.id };
}

async function requireProposal(proposalId: string): Promise<LearningProposalRow> {
  const proposal = await unwrapNullable<LearningProposalRow | null>(
    "select:learning_proposals:one",
    db.from("learning_proposals").select().eq("id", proposalId).maybeSingle()
  );
  if (!proposal) throw new Error(`Propuesta no encontrada: ${proposalId}`);
  return proposal;
}
