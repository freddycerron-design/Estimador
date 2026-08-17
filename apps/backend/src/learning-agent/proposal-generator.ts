import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { DetectedPattern, EstimationRuleDiff } from "@estimador/shared-types";
import { db, unwrap } from "../db/insforge-client.js";
import type { LearningEventRow } from "../db/types.js";
import { createLearningAgentProvider } from "../llm/provider-factory.js";
import type { LlmToolDefinition } from "../llm/types.js";

const RationaleSchema = z.object({
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
});

const DRAFT_TOOL_NAME = "draft_rule_rationale";
const draftTool: LlmToolDefinition = {
  name: DRAFT_TOOL_NAME,
  description: "Devuelve el título, descripción y justificación de la propuesta de regla de estimación.",
  inputSchema: zodToJsonSchema(RationaleSchema) as any,
};

/**
 * El NÚMERO de la regla (multiplier) se calcula de forma determinista a partir de la
 * estadística real (`avgVariancePct`) — nunca se le pide al LLM que lo invente. El LLM
 * solo redacta la justificación en lenguaje natural (spec §24: "generar una propuesta",
 * no auto-aplicar un cambio; spec §25: toda propuesta debe estar respaldada por evidencia).
 */
async function draftRationale(pattern: DetectedPattern, diff: EstimationRuleDiff): Promise<{ title: string; description: string; rationale: string }> {
  const llm = createLearningAgentProvider();
  const direction = pattern.avgVariancePct > 0 ? "subestimación" : "sobreestimación";
  const prompt = `Se detectó un patrón de ${direction} sistemática en proyectos tipo "${pattern.projectType}": la dimensión "${pattern.dimension}" tuvo una desviación promedio de ${pattern.avgVariancePct}% sobre ${pattern.sampleSize} proyectos con datos reales. Se propone un factor de ajuste de ${diff.multiplier}x para futuras estimaciones de este tipo de proyecto. Redacta un título corto, una descripción de 1-2 líneas y una justificación (rationale) de 2-4 líneas que explique el patrón, la evidencia (tamaño de muestra, magnitud) y el riesgo de aplicar el ajuste. Sé conservador y honesto sobre la certeza — ${pattern.sampleSize} proyectos es una muestra pequeña. Llama SIEMPRE a la tool "${DRAFT_TOOL_NAME}".`;

  const response = await llm.complete({
    system: "Eres el Learning Agent de un sistema de estimación de proyectos de TI: analizas evidencia real para proponer ajustes a las reglas de estimación, nunca inventas datos.",
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    tools: [draftTool],
    toolChoice: { type: "tool", toolName: DRAFT_TOOL_NAME },
    maxTokens: 800,
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("proposal-generator: el LLM no devolvió la justificación estructurada esperada");
  return RationaleSchema.parse(toolUse.input);
}

export async function generateProposals(): Promise<string[]> {
  const events = await unwrap<LearningEventRow[]>(
    "select:learning_events:pattern_detected",
    db.from("learning_events").select().eq("type", "pattern_detected").eq("processed", false)
  );

  const proposalIds: string[] = [];
  for (const event of events) {
    const pattern = event.payload as unknown as DetectedPattern;
    if (pattern.dimension !== "effort") {
      // MVP: solo generamos reglas de ajuste de esfuerzo; duration/cost quedan registrados pero sin propuesta automática todavía.
      await unwrap("update:learning_events:skip", db.from("learning_events").update({ processed: true }).eq("id", event.id).select());
      continue;
    }

    const multiplier = Math.round((1 + pattern.avgVariancePct / 100) * 100) / 100;
    const diff: EstimationRuleDiff = {
      ruleName: `effort-adjustment:${pattern.projectType}`,
      ruleType: "effort_adjustment",
      projectType: pattern.projectType,
      multiplier,
      basedOnPattern: pattern,
    };

    const { title, description, rationale } = await draftRationale(pattern, diff);

    const [proposal] = await unwrap<{ id: string }[]>(
      "insert:learning_proposals",
      db
        .from("learning_proposals")
        .insert([
          {
            type: "new_rule",
            title,
            description,
            rationale,
            diff,
            status: "DRAFT",
            related_learning_event_ids: [...pattern.sourceLearningEventIds, event.id],
          },
        ])
        .select("id")
    );
    if (proposal) proposalIds.push(proposal.id);

    await unwrap("update:learning_events:processed", db.from("learning_events").update({ processed: true }).eq("id", event.id).select());
  }

  return proposalIds;
}
