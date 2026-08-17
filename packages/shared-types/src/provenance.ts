import { z } from "zod";

/**
 * Trazabilidad de cada dato de salida del agente (spec §31).
 * FACTUAL   — proviene directamente de un proyecto histórico o del requerimiento del usuario.
 * CALCULATED— resultado de una fórmula/agregación sobre datos FACTUAL.
 * INFERRED  — inferencia del agente sobre información incompleta.
 * ASSUMPTION— supuesto explícito usado para llenar un vacío de información.
 * UNKNOWN   — no se pudo determinar ni inferir.
 */
export const ProvenanceSchema = z.enum([
  "FACTUAL",
  "CALCULATED",
  "INFERRED",
  "ASSUMPTION",
  "UNKNOWN",
]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const VersionedEntityStatusSchema = z.enum([
  "draft",
  "evaluation",
  "pending_approval",
  "approved",
  "active",
  "deprecated",
]);
export type VersionedEntityStatus = z.infer<typeof VersionedEntityStatusSchema>;

export const LearningProposalStatusSchema = z.enum([
  "DRAFT",
  "EVALUATION",
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVE",
  "REJECTED",
]);
export type LearningProposalStatus = z.infer<typeof LearningProposalStatusSchema>;

export const ConversationStatusSchema = z.enum([
  "NEW",
  "ANALYZING",
  "SEARCHING_REFERENCES",
  "AWAITING_CLARIFICATION",
  "ESTIMATING",
  "PRESENTING_RESULT",
  "COMPLETED",
  "ABANDONED",
]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
