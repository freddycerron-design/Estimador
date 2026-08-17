import type { JsonSchema, LlmProvider, EmbeddingProvider } from "../llm/types.js";

/**
 * Contexto inyectado a cada Skill al ejecutarla. Ninguna Skill importa el cliente de InsForge
 * o el LlmProvider directamente — todo llega por `ctx`, así son testeables sin red.
 */
export interface SkillContext {
  embed(text: string): Promise<number[]>;
  llm: LlmProvider;
  /** system_settings resueltos (MIN_SIMILARITY_THRESHOLD, etc.) — ver config/system-settings.ts */
  settings: Record<string, unknown>;
  /** Configuración de la versión ACTIVA de esta skill (skill_versions.definition). {} si no hay overrides. */
  config: Record<string, unknown>;
}

export interface SkillDefinition<TInput, TOutput> {
  key: string;
  toolName: string;
  description: string;
  inputSchema: JsonSchema;
  execute(input: TInput, ctx: SkillContext): Promise<TOutput>;
}

export function defineSkill<TInput, TOutput>(def: SkillDefinition<TInput, TOutput>): SkillDefinition<TInput, TOutput> {
  return def;
}
