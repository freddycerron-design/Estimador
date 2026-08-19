import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, unwrap, unwrapNullable } from "../../db/insforge-client.js";
import type { SkillRow, SkillVersionRow } from "../../db/types.js";
import { requireAdmin } from "../../plugins/require-admin.js";
import { SKILL_CONFIG_REGISTRY } from "../../skills/config-registry.js";

// `config` es la parametrización jsonb de la skill (spec §21/§25) — el shape exacto varía por
// skill (ver `ctx.config.*` en cada `skills/<key>/index.ts`), así que solo exigimos que sea un
// objeto JSON plano; cada skill interpreta sus propias claves con sus propios defaults.
const CreateVersionBody = z.object({
  config: z.record(z.string(), z.unknown()),
  note: z.string().trim().min(1).optional(),
});

async function findSkillByKey(skillKey: string): Promise<SkillRow | null> {
  return unwrapNullable<SkillRow | null>(`select:skills:${skillKey}`, db.from("skills").select().eq("key", skillKey).maybeSingle());
}

export default async function skillsRoutes(app: FastifyInstance) {
  // Catálogo de skills + resumen de su versión activa y cuántas versiones tiene en total.
  app.get("/admin/skills", async () => {
    const skills = await unwrap<SkillRow[]>("select:skills", db.from("skills").select().order("key"));
    const versions = await unwrap<SkillVersionRow[]>("select:skill_versions:all", db.from("skill_versions").select());

    return skills.map((skill) => {
      const skillVersions = versions.filter((v) => v.skill_id === skill.id);
      const active = skillVersions.find((v) => v.status === "active") ?? null;
      return { ...skill, versionCount: skillVersions.length, activeVersion: active, configSchema: SKILL_CONFIG_REGISTRY[skill.key] ?? [] };
    });
  });

  // Historial completo de versiones de una skill, más reciente primero.
  app.get("/admin/skills/:skillKey/versions", async (req, reply) => {
    const { skillKey } = req.params as { skillKey: string };
    const skill = await findSkillByKey(skillKey);
    if (!skill) {
      reply.code(404);
      return { error: `No existe la skill '${skillKey}'` };
    }
    const versions = await unwrap<SkillVersionRow[]>(
      `select:skill_versions:${skillKey}`,
      db.from("skill_versions").select().eq("skill_id", skill.id).order("version", { ascending: false })
    );
    return { skill: { ...skill, configSchema: SKILL_CONFIG_REGISTRY[skill.key] ?? [] }, versions };
  });

  // Crea una nueva versión y la activa de inmediato, desactivando la que estaba activa —
  // mismo patrón atómico (secuencia desactivar+insertar) que /admin/config (nunca sobreescribe
  // una versión existente). No hace falta la máquina de estados de aprobación de learning-agent:
  // acá es un admin humano editando parametrización directamente.
  app.post("/admin/skills/:skillKey/versions", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const { skillKey } = req.params as { skillKey: string };
    const skill = await findSkillByKey(skillKey);
    if (!skill) {
      reply.code(404);
      return { error: `No existe la skill '${skillKey}'` };
    }
    const body = CreateVersionBody.parse(req.body);

    const existing = await unwrap<SkillVersionRow[]>(
      `select:skill_versions:${skillKey}:latest`,
      db.from("skill_versions").select().eq("skill_id", skill.id).order("version", { ascending: false }).limit(1)
    );
    const nextVersion = (existing[0]?.version ?? 0) + 1;

    await unwrap(
      `deactivate:skill_versions:${skillKey}`,
      db.from("skill_versions").update({ status: "deprecated" }).eq("skill_id", skill.id).eq("status", "active").select()
    );
    const [created] = await unwrap<SkillVersionRow[]>(
      `insert:skill_versions:${skillKey}`,
      db
        .from("skill_versions")
        .insert([
          {
            skill_id: skill.id,
            version: nextVersion,
            definition: body.config,
            status: "active",
            created_by: req.userId,
            activated_at: new Date().toISOString(),
            note: body.note ?? null,
          },
        ])
        .select()
    );
    // No hace falta invalidar caché: `loadActiveSkillConfig` (skill-runtime.ts) consulta
    // skill_versions en cada `execute()`, no cachea la config por proceso (a diferencia de
    // system_settings) — la nueva versión queda activa de inmediato.
    reply.code(201);
    return created;
  });
}
