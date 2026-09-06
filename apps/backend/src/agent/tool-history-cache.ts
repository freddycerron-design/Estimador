import type { LlmMessage } from "../llm/types.js";

/**
 * Reconstruye, a partir del historial completo de la conversación (todos los turnos, no solo
 * el actual), el último resultado EXITOSO de cada tool ejecutada — para que `generate_report`
 * no dependa de que el modelo vuelva a ejecutar, EN ESTE MISMO TURNO, una tool que ya corrió
 * bien en un turno anterior.
 *
 * Motivo (bug reportado por usuario): `runAgentTurn` arranca `toolTrace` vacío en cada turno
 * (memoria de tool-use no persistida entre mensajes), así que `assembleBundleFromTrace` solo
 * veía las tools de ESE turno. El system prompt le pedía al modelo repetir analyze_requirement/
 * search_similar_projects/estimate_effort_duration/calculate_cost cada vez que finalmente tenía
 * todo listo para estimar — pero el modelo no siempre lo hacía bien (a veces intentaba
 * `generate_report` con un JSON armado de memoria, o reenviaba `calculate_cost` con parámetros
 * incompletos), entrando en un ciclo de reintentos fallidos y visibles para el usuario.
 *
 * `history` ya incluye TODO el historial persistido de la conversación (`sendMessage` arma
 * `params.history` con `listMessages(conversationId)` completo, no solo el turno actual), así
 * que recorrerlo una vez alcanza para reconstruir "lo último que sabíamos" de cada tool, sin
 * tocar el schema ni agregar una tabla/columna nueva — la fuente de verdad sigue siendo
 * `messages`, igual que el resto de la conversación.
 */
export function buildToolOutputCache(history: LlmMessage[]): Map<string, unknown> {
  const nameById = new Map<string, string>();
  const cache = new Map<string, unknown>();

  for (const message of history) {
    if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "tool_use") nameById.set(block.id, block.name);
      }
    } else if (message.role === "tool") {
      for (const block of message.content) {
        if (block.type !== "tool_result" || block.isError) continue;
        const toolName = nameById.get(block.toolUseId);
        if (!toolName) continue;
        try {
          // Se sobreescribe si el mismo tool corrió más de una vez — gana el más reciente.
          cache.set(toolName, JSON.parse(block.content));
        } catch {
          // Resultado no-JSON (no debería pasar en la práctica) — se ignora en vez de romper
          // la reconstrucción de todo el caché por una sola entrada rara.
        }
      }
    }
  }

  return cache;
}
