import { db, unwrap, unwrapNullable } from "../db/insforge-client.js";
import type { SkillRow, SkillVersionRow } from "../db/types.js";
import { loadSystemSettings } from "../config/system-settings.js";
import { createOrchestratorProvider, createEmbeddingProvider } from "../llm/provider-factory.js";
import type { SkillContext } from "./types.js";

/**
 * Resuelve la versión ACTIVA de una skill (skills + skill_versions, status='active', mayor versión)
 * y arma el `SkillContext` que se le pasa a `execute()`. Este es el único lugar que decide qué
 * parametrización usa una skill en runtime — permite versionar/aprobar cambios sin tocar código
 * (spec §21, §25: DRAFT→...→ACTIVE).
 */
export async function loadActiveSkillConfig(skillKey: string): Promise<Record<string, unknown>> {
  const skill = await unwrapNullable<SkillRow | null>(
    `select:skills:${skillKey}`,
    db.from("skills").select().eq("key", skillKey).maybeSingle()
  );
  if (!skill) return {};

  const versions = await unwrap<SkillVersionRow[]>(
    `select:skill_versions:${skillKey}`,
    db.from("skill_versions").select().eq("skill_id", skill.id).eq("status", "active").order("version", { ascending: false }).limit(1)
  );
  return versions[0]?.definition ?? {};
}

let cachedSettings: Record<string, unknown> | null = null;

export async function buildSkillContext(skillKey: string): Promise<SkillContext> {
  // Los system_settings cambian poco; cachear por proceso evita una query por cada tool-call.
  if (!cachedSettings) cachedSettings = await loadSystemSettings();
  const config = await loadActiveSkillConfig(skillKey);
  const embedder = createEmbeddingProvider();
  const llm = createOrchestratorProvider();

  return {
    embed: (text: string) => embedder.embed(text),
    llm,
    settings: cachedSettings,
    config,
  };
}

/** Invalida la caché de system_settings — llamar tras actualizarlos desde /admin/config. */
export function invalidateSettingsCache() {
  cachedSettings = null;
}
