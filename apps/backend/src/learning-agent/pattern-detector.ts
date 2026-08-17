import type { DetectedPattern } from "@estimador/shared-types";
import { db, unwrap } from "../db/insforge-client.js";
import { buildSkillContext } from "../skills/skill-runtime.js";
import { estimationLearningSkill } from "../skills/estimation-learning/index.js";

/**
 * Orquesta la Skill determinista `estimation-learning` sobre los `learning_events` sin
 * procesar: marca como procesados los que ya se consideraron (formen o no un patrón — no
 * quedan eventos "flotando" sin revisión, spec §19), y registra un nuevo `learning_events`
 * tipo `pattern_detected` por cada patrón real encontrado, que `proposal-generator.ts`
 * consumirá después.
 */
export async function runPatternDetection(): Promise<DetectedPattern[]> {
  const ctx = await buildSkillContext("estimation-learning");
  const { patterns, inconclusiveEventIds } = await estimationLearningSkill.execute({}, ctx);

  const consideredIds = [...new Set([...patterns.flatMap((p) => p.sourceLearningEventIds), ...inconclusiveEventIds])];
  if (consideredIds.length > 0) {
    await unwrap("update:learning_events:processed", db.from("learning_events").update({ processed: true }).in("id", consideredIds).select());
  }

  if (patterns.length > 0) {
    await unwrap(
      "insert:learning_events:pattern_detected",
      db
        .from("learning_events")
        .insert(patterns.map((p) => ({ type: "pattern_detected", payload: p, processed: false })))
        .select()
    );
  }

  return patterns;
}
