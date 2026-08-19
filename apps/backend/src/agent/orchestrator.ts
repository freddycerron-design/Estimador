import { randomUUID } from "node:crypto";
import type { EstimationParameters } from "@estimador/shared-types";
import type { LlmMessage, LlmContentBlock } from "../llm/types.js";
import { createOrchestratorProvider } from "../llm/provider-factory.js";
import { toolDefinitions, dispatchTool, skillKeyForToolName } from "./tool-registry.js";
import { buildSkillContext } from "../skills/skill-runtime.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { assembleBundleFromTrace } from "./bundle-assembler.js";
import { persistEstimate } from "./estimate-persistence.js";
import { resolveEffectiveParameters } from "../config/estimation-parameters.js";

export interface ToolTraceEntry {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

export interface AgentTurnResult {
  finalText: string;
  /** Historial completo con los mensajes nuevos (assistant + tool) generados en este turno, para persistir. */
  newMessages: LlmMessage[];
  toolTrace: ToolTraceEntry[];
}

const DEFAULT_MAX_TOOL_ITERATIONS = 10;

/**
 * Bucle manual de tool-use (spec: sin Claude Agent SDK). Llama al LlmProvider, y si la
 * respuesta pide tools, las ejecuta contra las Skills (vía tool-registry + skill-runtime),
 * agrega los resultados al historial y repite — acotado por `maxToolIterations` para nunca
 * quedar en un loop infinito.
 */
export async function runAgentTurn(params: {
  history: LlmMessage[]; // incluye ya el mensaje del usuario para este turno
  conversationId: string;
  maxToolIterations?: number;
  /** Parámetros de estimación marcados por el usuario al iniciar esta conversación (conversations.parameters). */
  parameters?: EstimationParameters | null;
}): Promise<AgentTurnResult> {
  const llm = createOrchestratorProvider();
  const tools = toolDefinitions();
  const maxIterations = params.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;

  const messages: LlmMessage[] = [...params.history];
  const newMessages: LlmMessage[] = [];
  const toolTrace: ToolTraceEntry[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const response = await llm.complete({
      system: buildSystemPrompt(),
      messages,
      tools,
      maxTokens: 4096,
    });

    const assistantMessage: LlmMessage = { role: "assistant", content: response.content };
    messages.push(assistantMessage);
    newMessages.push(assistantMessage);

    if (response.stopReason !== "tool_use") {
      const finalText = textOf(response.content);
      return { finalText, newMessages, toolTrace };
    }

    const toolUseBlocks = response.content.filter((b): b is Extract<LlmContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    const resultBlocks: LlmContentBlock[] = [];

    for (const call of toolUseBlocks) {
      try {
        const skillKey = skillKeyForToolName(call.name);
        if (!skillKey) throw new Error(`Tool sin skill asociada: ${call.name}`);
        const ctx = await buildSkillContext(skillKey, params.parameters);

        // generate_report NO confía en que el LLM reconstruya el bundle completo desde su
        // memoria de conversación (frágil, ver bundle-assembler.ts) — el backend lo ensambla
        // desde los outputs reales de las tools ya ejecutadas en este turno.
        let toolInput = call.input;
        let extraOutputFields: Record<string, unknown> | undefined;

        // Inyectar projectType desde el último analyze_requirement de este turno — no depender
        // de que el LLM lo copie correctamente al llamar estimate_effort_duration (mismo criterio
        // que generate_report: el backend completa lo que puede verificar, no confía en la memoria del LLM).
        if (call.name === "estimate_effort_duration") {
          const lastAnalysis = [...toolTrace].reverse().find((t) => t.toolName === "analyze_requirement" && !t.error);
          const projectType = (lastAnalysis?.output as { projectType?: string | null } | undefined)?.projectType;
          if (projectType) toolInput = { ...(call.input as object), projectType };
        }

        if (call.name === "generate_report") {
          const bundle = await assembleBundleFromTrace(toolTrace);
          if (!bundle) {
            throw new Error(
              "generate_report: aún no se completaron los pasos previos (analyze_requirement, search_similar_projects, estimate_effort_duration, calculate_cost) en este turno."
            );
          }
          const template = (call.input as { template?: string })?.template ?? "detailed";
          toolInput = { template, bundle };
          // Persistir la estimación ahora que existe el bundle completo — de lo contrario
          // nunca queda nada en project_estimates para feedback/actuals/aprendizaje futuro.
          // `ctx.settings` de report-generation ya trae el merge (global + overrides) aplicado
          // por buildSkillContext — congelamos ese mismo snapshot, no solo la intención del usuario.
          const effectiveParameters = resolveEffectiveParameters(ctx.settings, params.parameters);
          const estimateId = await persistEstimate(params.conversationId, template, bundle, effectiveParameters);
          extraOutputFields = { estimateId };
        }

        const output = await dispatchTool(call.name, toolInput, ctx);
        const finalOutput = extraOutputFields ? { ...(output as object), ...extraOutputFields } : output;
        toolTrace.push({ toolCallId: call.id, toolName: call.name, input: toolInput, output: finalOutput });
        resultBlocks.push({ type: "tool_result", toolUseId: call.id, content: JSON.stringify(finalOutput) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolTrace.push({ toolCallId: call.id, toolName: call.name, input: call.input, error: message });
        resultBlocks.push({ type: "tool_result", toolUseId: call.id, content: JSON.stringify({ error: message }), isError: true });
      }
    }

    const toolMessage: LlmMessage = { role: "tool", content: resultBlocks };
    messages.push(toolMessage);
    newMessages.push(toolMessage);
  }

  // Se agotaron las iteraciones sin llegar a end_turn: devolver algo útil en vez de fallar en silencio.
  const fallbackText =
    "No pude completar el análisis en el número máximo de pasos configurado. Te comparto lo que alcancé a determinar hasta ahora — puedes pedirme que continúe.";
  const fallbackMessage: LlmMessage = { role: "assistant", content: [{ type: "text", text: fallbackText }] };
  newMessages.push(fallbackMessage);
  return { finalText: fallbackText, newMessages, toolTrace };
}

function textOf(content: LlmContentBlock[]): string {
  return content
    .filter((b): b is Extract<LlmContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export function userMessage(text: string): LlmMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

export function newToolCallId(): string {
  return `call_${randomUUID()}`;
}
