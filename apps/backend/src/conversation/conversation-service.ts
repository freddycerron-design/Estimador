import type { ConversationStatus } from "@estimador/shared-types";
import { db, unwrap, unwrapNullable } from "../db/insforge-client.js";
import type { ConversationRow, MessageRow } from "../db/types.js";
import { runAgentTurn, userMessage, type ToolTraceEntry } from "../agent/orchestrator.js";
import { fromDbMessage, toDbMessage } from "./serialization.js";
import { inferNextStatus } from "./state-machine.js";
import { loadSystemSettings, getSetting } from "../config/system-settings.js";

export interface SendMessageResult {
  conversationId: string;
  status: ConversationStatus;
  assistantText: string;
  toolTrace: ToolTraceEntry[];
  /** Presente si este turno generó y persistió una estimación final (spec: trazabilidad para feedback/actuals). */
  estimateId?: string;
}

export async function createConversation(userId: string, title?: string, requirementId?: string): Promise<ConversationRow> {
  const [conversation] = await unwrap<ConversationRow[]>(
    "insert:conversations",
    db
      .from("conversations")
      .insert([{ user_id: userId, title: title ?? null, status: "NEW", context: {}, requirement_id: requirementId ?? null }])
      .select()
  );
  if (!conversation) throw new Error("No se pudo crear la conversación");

  if (requirementId) {
    await unwrap("update:requirements:in_estimation", db.from("requirements").update({ status: "in_estimation", updated_at: new Date().toISOString() }).eq("id", requirementId).select());
  }

  return conversation;
}

export async function getConversation(conversationId: string): Promise<ConversationRow | null> {
  return unwrapNullable<ConversationRow | null>(
    "select:conversations:one",
    db.from("conversations").select().eq("id", conversationId).maybeSingle()
  );
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  return unwrap<MessageRow[]>(
    "select:messages",
    db.from("messages").select().eq("conversation_id", conversationId).order("created_at", { ascending: true })
  );
}

export async function sendMessage(conversationId: string, userText: string): Promise<SendMessageResult> {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error(`Conversación no encontrada: ${conversationId}`);

  const priorRows = await listMessages(conversationId);
  const history = priorRows.map(fromDbMessage);

  const settings = await loadSystemSettings();
  const maxIterations = getSetting(settings, "MAX_ADAPTIVE_ITERATIONS", 5);
  const iterationCount = (conversation.context as { iterationCount?: number }).iterationCount ?? 0;

  const limitNote =
    conversation.status === "AWAITING_CLARIFICATION" && iterationCount >= maxIterations
      ? "\n\n[Sistema: se alcanzó el límite configurado de iteraciones de preguntas. Presenta la mejor estimación posible con la información disponible ahora, indicando claramente el nivel de confianza reducido, en vez de seguir pidiendo más datos.]"
      : "";

  const newUserMessage = userMessage(userText + limitNote);
  const fullHistory = [...history, newUserMessage];

  // Persistir el mensaje del usuario ANTES de llamar al LLM — si algo falla después, no se pierde.
  await unwrap(
    "insert:messages:user",
    db.from("messages").insert([{ conversation_id: conversationId, ...toDbMessage(newUserMessage) }]).select()
  );

  const turn = await runAgentTurn({ history: fullHistory, conversationId });

  const rowsToInsert = turn.newMessages.map((msg) => ({ conversation_id: conversationId, ...toDbMessage(msg) }));
  if (rowsToInsert.length > 0) {
    await unwrap("insert:messages:assistant", db.from("messages").insert(rowsToInsert).select());
  }

  const nextStatus = inferNextStatus(conversation.status, turn.toolTrace);
  const nextIterationCount = nextStatus === "AWAITING_CLARIFICATION" ? iterationCount + 1 : iterationCount;

  await unwrap(
    "update:conversations",
    db
      .from("conversations")
      .update({
        status: nextStatus,
        context: { ...conversation.context, iterationCount: nextIterationCount },
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .select()
  );

  const reportEntry = [...turn.toolTrace].reverse().find((t) => t.toolName === "generate_report" && !t.error);
  const estimateId = (reportEntry?.output as { estimateId?: string } | undefined)?.estimateId;

  // Si esta conversación vino de un requerimiento cargado (spec pedido por usuario:
  // "Requerimientos" con selección → estimación), marcarlo como estimado y enlazarlo.
  if (estimateId && conversation.requirement_id) {
    await unwrap(
      "update:requirements:estimated",
      db
        .from("requirements")
        .update({ status: "estimated", estimate_id: estimateId, updated_at: new Date().toISOString() })
        .eq("id", conversation.requirement_id)
        .select()
    );
  }

  return { conversationId, status: nextStatus, assistantText: turn.finalText, toolTrace: turn.toolTrace, estimateId };
}
