import { db, unwrap } from "../db/insforge-client.js";
import type { AgentPromptVersionRow } from "../db/types.js";
import { DEFAULT_AGENT_SYSTEM_PROMPT } from "../agent/system-prompt.js";

let cached: string | null = null;

/**
 * System prompt ACTIVO del orquestador (spec pedido por usuario: editable desde Admin) —
 * cacheado por proceso igual que `system_settings`/`cost_rates`, invalidar tras editar.
 * Si no hay ninguna versión activa en la base (no debería pasar tras el seed), cae al prompt
 * hardcodeado por defecto — el agente nunca debe quedar sin instrucciones.
 */
export async function loadActiveAgentPrompt(): Promise<string> {
  if (cached) return cached;
  const rows = await unwrap<AgentPromptVersionRow[]>(
    "select:agent_prompt_versions:active",
    db.from("agent_prompt_versions").select().eq("is_active", true).limit(1)
  );
  cached = rows[0]?.content ?? DEFAULT_AGENT_SYSTEM_PROMPT;
  return cached;
}

export function invalidateAgentPromptCache() {
  cached = null;
}
