import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { DetectedPattern } from "@estimador/shared-types";
import { db, unwrap } from "../../db/insforge-client.js";
import type { LearningEventRow, ProjectRow, ProjectActualRow } from "../../db/types.js";
import { defineSkill } from "../types.js";
import { getSetting } from "../../config/system-settings.js";

const InputSchema = z.object({});

export interface EstimationLearningOutput {
  patterns: DetectedPattern[];
  /** Eventos considerados pero que no formaron un patrón (muestra insuficiente) — para transparencia, no se descartan en silencio. */
  inconclusiveEventIds: string[];
}

/**
 * Skill NO expuesta al agente conversacional (spec §24: "la usa directamente el Learning
 * Agent"). Puramente determinista — SQL/estadística, sin LLM — para que la detección de
 * patrones sea auditable y no dependa de la interpretación de un modelo. Agrupa
 * `variance_detected`/`feedback_received` no procesados por tipo de proyecto y calcula si hay
 * una desviación sistemática con muestra suficiente (spec §25: "no convertir una única
 * experiencia en una nueva regla").
 */
export const estimationLearningSkill = defineSkill<Record<string, never>, EstimationLearningOutput>({
  key: "estimation-learning",
  toolName: "detect_estimation_patterns",
  description: "Detecta patrones de desviación sistemática (esfuerzo/duración/costo) entre estimaciones y resultados reales, agrupados por tipo de proyecto.",
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(_input, ctx) {
    const minSampleSize = getSetting(ctx.settings, "MIN_SAMPLE_SIZE_FOR_PATTERN", 3);
    const varianceThreshold = getSetting(ctx.settings, "PATTERN_VARIANCE_THRESHOLD_PCT", 12);

    const events = await unwrap<LearningEventRow[]>(
      "select:learning_events:unprocessed",
      db.from("learning_events").select().eq("processed", false).eq("type", "variance_detected")
    );
    if (events.length === 0) return { patterns: [], inconclusiveEventIds: [] };

    const projectIds = [...new Set(events.map((e) => (e.payload as { projectId?: string }).projectId).filter((x): x is string => !!x))];
    const [projects, actuals] = await Promise.all([
      unwrap<ProjectRow[]>("select:projects:for_patterns", db.from("projects").select().in("id", projectIds)),
      unwrap<ProjectActualRow[]>("select:project_actuals:for_patterns", db.from("project_actuals").select().in("project_id", projectIds)),
    ]);
    const typeByProjectId = new Map(projects.map((p) => [p.id, p.project_type]));

    type Dimension = "effort" | "duration" | "cost";
    const groups = new Map<string, { eventId: string; variancePct: number }[]>();

    for (const event of events) {
      const payload = event.payload as {
        projectId?: string;
        effortVariancePct?: number | null;
        durationVariancePct?: number | null;
        costVariancePct?: number | null;
      };
      if (!payload.projectId) continue;
      const projectType = typeByProjectId.get(payload.projectId);
      if (!projectType) continue;

      const dims: [Dimension, number | null | undefined][] = [
        ["effort", payload.effortVariancePct],
        ["duration", payload.durationVariancePct],
        ["cost", payload.costVariancePct],
      ];
      for (const [dim, value] of dims) {
        if (value === null || value === undefined) continue;
        const key = `${projectType}::${dim}`;
        const list = groups.get(key) ?? [];
        list.push({ eventId: event.id, variancePct: value });
        groups.set(key, list);
      }
    }

    const patterns: DetectedPattern[] = [];
    const usedEventIds = new Set<string>();
    const inconclusive = new Set(events.map((e) => e.id));

    for (const [key, entries] of groups) {
      const [projectType, dimension] = key.split("::") as [string, Dimension];
      if (entries.length < minSampleSize) continue;

      const avg = entries.reduce((sum, e) => sum + e.variancePct, 0) / entries.length;
      if (Math.abs(avg) < varianceThreshold) continue;

      // Consistencia de dirección: si el signo varía mucho entre proyectos, no es un patrón sistemático.
      const sameDirection = entries.filter((e) => Math.sign(e.variancePct) === Math.sign(avg)).length;
      if (sameDirection / entries.length < 0.7) continue;

      const eventIds = entries.map((e) => e.eventId);
      patterns.push({ projectType, dimension, avgVariancePct: Math.round(avg * 10) / 10, sampleSize: entries.length, sourceLearningEventIds: eventIds });
      for (const id of eventIds) {
        usedEventIds.add(id);
        inconclusive.delete(id);
      }
    }

    return { patterns, inconclusiveEventIds: [...inconclusive] };
  },
});
