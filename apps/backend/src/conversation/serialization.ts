import type { LlmMessage, LlmContentBlock } from "../llm/types.js";
import type { MessageRow } from "../db/types.js";

/**
 * Serializa un `LlmMessage` a las columnas de `messages`. `content` guarda un extracto de
 * texto (para lectura/búsqueda rápida); `tool_calls` guarda el arreglo completo de content
 * blocks en JSON — es la fuente de verdad para reconstruir el mensaje exacto en el próximo turno.
 */
export function toDbMessage(msg: LlmMessage): { role: string; content: string | null; tool_calls: unknown } {
  const textBlocks = msg.content.filter((b): b is Extract<LlmContentBlock, { type: "text" }> => b.type === "text");
  const text = textBlocks.map((b) => b.text).join("\n") || null;
  const hasOnlyText = msg.content.every((b) => b.type === "text");
  return {
    role: msg.role,
    content: text,
    tool_calls: hasOnlyText ? null : msg.content,
  };
}

export function fromDbMessage(row: Pick<MessageRow, "role" | "content" | "tool_calls">): LlmMessage {
  if (row.tool_calls) {
    return { role: row.role, content: row.tool_calls as LlmContentBlock[] };
  }
  return { role: row.role, content: [{ type: "text", text: row.content ?? "" }] };
}
