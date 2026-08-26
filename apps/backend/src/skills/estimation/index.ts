import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { EstimationOutput, SimilarityCandidate } from "@estimador/shared-types";
import { db, unwrap } from "../../db/insforge-client.js";
import type { ProjectRow, ProjectActualRow } from "../../db/types.js";
import type { EstimationRuleDiff } from "@estimador/shared-types";
import { defineSkill } from "../types.js";
import { loadReferenceLookup } from "../../config/reference-lookup.js";
import { loadActiveEstimationRules } from "../../config/estimation-rules.js";
import {
  weightedLineItems,
  totalHoursOfReference,
  coefficientOfVariation,
  rangeFrom,
  weightedDurationWeeks,
  computeConfidenceFactors,
  confidenceScoreFrom,
  toLineItems,
  filterReferencesByRoles,
  type ReferenceActuals,
} from "./estimation-engine.js";

const CandidateSchema = z.object({
  projectId: z.string().uuid(),
  totalSimilarity: z.number(),
  dimensionScores: z.record(z.string(), z.number()),
  isOutlier: z.boolean(),
  outlierReason: z.string().optional(),
});

const InputSchema = z.object({
  usableCandidates: z.array(CandidateSchema).min(1, "Se requiere al menos una referencia usable para estimar"),
  missingInformationCount: z.number().default(0),
  /** Tipo de proyecto del requerimiento — usado para aplicar reglas de ajuste aprendidas (spec §18-25), si existen. */
  projectType: z.string().nullable().optional(),
  /** Roles a incluir en el desglose (conversations.included_role_ids) — null/vacío = todos, sin filtrar. */
  includedRoleIds: z.array(z.string().uuid()).nullable().optional(),
});

export const estimationSkill = defineSkill<
  { usableCandidates: SimilarityCandidate[]; missingInformationCount?: number; projectType?: string | null; includedRoleIds?: string[] | null },
  EstimationOutput
>({
  key: "estimation",
  toolName: "estimate_effort_duration",
  description:
    "Calcula esfuerzo (horas por fase y rol), duración, rango (optimista/probable/pesimista) y nivel de confianza, ponderando por similitud las referencias históricas usables. Requiere que project-similarity ya haya determinado referencias por encima del umbral.",
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(input) {
    const { usableCandidates, includedRoleIds } = InputSchema.parse(input);
    const missingInformationCount = input.missingInformationCount ?? 0;

    const projectIds = usableCandidates.map((c) => c.projectId);
    const [projects, actuals, lookup] = await Promise.all([
      unwrap<ProjectRow[]>("select:projects:references", db.from("projects").select().in("id", projectIds)),
      unwrap<ProjectActualRow[]>("select:project_actuals:references", db.from("project_actuals").select().in("project_id", projectIds)),
      loadReferenceLookup(),
    ]);

    const projectById = new Map(projects.map((p) => [p.id, p]));
    const actualsByProject = new Map(actuals.map((a) => [a.project_id, a]));

    const similaritySum = usableCandidates.reduce((sum, c) => sum + c.totalSimilarity, 0);
    const references: ReferenceActuals[] = usableCandidates
      .map((c) => {
        const project = projectById.get(c.projectId);
        const actual = actualsByProject.get(c.projectId);
        if (!project || !actual) return null;
        return {
          projectId: c.projectId,
          weight: similaritySum > 0 ? c.totalSimilarity / similaritySum : 1 / usableCandidates.length,
          durationWeeks: Number(project.duration_weeks ?? actual.actual_duration_weeks ?? 0),
          effortHours: actual.actual_effort_hours,
        };
      })
      .filter((r): r is ReferenceActuals => r !== null);

    if (references.length === 0) {
      throw new Error("Ninguna referencia usable tiene datos de esfuerzo real (project_actuals) — no se puede estimar.");
    }

    const filteredReferences = filterReferencesByRoles(references, includedRoleIds);

    const byPhaseRole = weightedLineItems(filteredReferences);
    const lineItems = toLineItems(
      byPhaseRole,
      (id) => lookup.phasesById.get(id)?.name ?? id,
      (id) => lookup.rolesById.get(id)?.name ?? id
    );

    let probableHours = lineItems.reduce((sum, li) => sum + li.hours, 0);
    const totals = filteredReferences.map(totalHoursOfReference);
    const cv = coefficientOfVariation(totals);

    // Aplicar reglas de ajuste APROBADAS y ACTIVAS del Learning Agent para este tipo de
    // proyecto (spec §18-25) — nunca se auto-generan ni auto-activan acá, solo se consumen
    // las que ya pasaron por DRAFT→EVALUATION→PENDING_APPROVAL→APPROVED→ACTIVE con aprobación humana.
    let appliedRuleNote: string | null = null;
    if (input.projectType) {
      const activeRules = await loadActiveEstimationRules();
      const matchingRule = activeRules.find((r) => r.rule_type === "effort_adjustment" && (r.definition as unknown as EstimationRuleDiff).projectType === input.projectType);
      if (matchingRule) {
        const diff = matchingRule.definition as unknown as EstimationRuleDiff;
        const factor = diff.multiplier;
        for (const li of lineItems) {
          li.hours = Math.round(li.hours * factor);
          li.provenance = "CALCULATED";
        }
        probableHours = lineItems.reduce((sum, li) => sum + li.hours, 0);
        appliedRuleNote = `Se aplicó una regla de ajuste aprendida y aprobada (factor ${factor}x) para proyectos tipo "${input.projectType}", basada en la desviación real observada en ${diff.basedOnPattern.sampleSize} proyecto(s) histórico(s) (spec: Learning Agent, versión ${matchingRule.version}).`;
      }
    }

    const effortHoursRange = rangeFrom(probableHours, cv);

    const probableWeeks = weightedDurationWeeks(references);
    const durationWeeksRange = rangeFrom(probableWeeks, cv * 0.7); // duración típicamente varía menos que el esfuerzo puro

    const similarityAvg = usableCandidates.reduce((sum, c) => sum + c.totalSimilarity, 0) / usableCandidates.length;
    const infoCompleteness = Math.max(0, 1 - missingInformationCount * 0.1);
    const confidenceFactors = computeConfidenceFactors(similarityAvg, references.length, cv, infoCompleteness);
    const confidenceScore = confidenceScoreFrom(confidenceFactors);

    const assumptions = [
      `Estimación ponderada por similitud entre ${references.length} proyecto(s) histórico(s) de referencia.`,
      "Las fases/roles que no aparecen en todas las referencias quedan proporcionalmente sub-representadas en el promedio ponderado.",
      references.length === 1
        ? "Con una sola referencia usable, el rango optimista/pesimista usa un margen de incertidumbre por defecto (±15%), no dispersión real observada."
        : `Rango calculado a partir de la dispersión real de esfuerzo entre las ${references.length} referencias (coef. de variación ${(cv * 100).toFixed(0)}%).`,
    ];
    if (appliedRuleNote) assumptions.push(appliedRuleNote);
    if (includedRoleIds && includedRoleIds.length > 0) {
      const names = includedRoleIds.map((id) => lookup.rolesById.get(id)?.name ?? id).join(", ");
      assumptions.push(`Se limitó el desglose a los roles seleccionados por el usuario para esta estimación: ${names}.`);
    }

    return { lineItems, effortHoursRange, durationWeeksRange, confidenceScore, confidenceFactors, assumptions };
  },
});
