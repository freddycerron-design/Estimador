import type { ConversationStatus } from "@estimador/shared-types";
import type { ToolTraceEntry } from "../agent/orchestrator.js";

/**
 * Infiere el siguiente estado de la conversación a partir de qué tools se ejecutaron en el
 * turno (spec §9: NEW→ANALYZING→SEARCHING_REFERENCES→(AWAITING_CLARIFICATION⇄SEARCHING_REFERENCES)*→
 * ESTIMATING→PRESENTING_RESULT→COMPLETED). El agente decide qué tools llamar; este estado es
 * informativo/de auditoría, no un guion rígido que el agente deba seguir paso a paso.
 */
export function inferNextStatus(current: ConversationStatus, toolTrace: ToolTraceEntry[]): ConversationStatus {
  if (current === "COMPLETED" || current === "ABANDONED") return current;

  const called = new Set(toolTrace.map((t) => t.toolName));

  if (called.has("generate_report")) return "PRESENTING_RESULT";
  if (called.has("estimate_effort_duration") || called.has("calculate_cost")) return "ESTIMATING";

  if (called.has("search_similar_projects")) {
    const searchCall = toolTrace.find((t) => t.toolName === "search_similar_projects");
    const output = searchCall?.output as { referenceFound?: boolean } | undefined;
    if (output && output.referenceFound === false) return "AWAITING_CLARIFICATION";
    return "SEARCHING_REFERENCES";
  }

  if (called.has("analyze_requirement")) return "ANALYZING";

  return current === "NEW" ? "ANALYZING" : current;
}

export function isTerminal(status: ConversationStatus): boolean {
  return status === "COMPLETED" || status === "ABANDONED";
}
