import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, unwrap } from "../../db/insforge-client.js";
import type { AgentPromptVersionRow } from "../../db/types.js";
import { requireAdmin } from "../../plugins/require-admin.js";
import { invalidateAgentPromptCache } from "../../config/agent-prompt.js";

const CreateVersionBody = z.object({
  content: z.string().trim().min(1, "El prompt no puede estar vacío"),
  note: z.string().trim().min(1).optional(),
  password: z.string(),
});

// Password adicional pedido por el usuario para guardar una nueva versión del prompt — más allá
// del rol admin, una segunda confirmación explícita antes de cambiar el comportamiento de TODAS
// las conversaciones. No es un mecanismo de autenticación real (valor fijo, no por-usuario);
// es una traba deliberada contra guardar por accidente, no contra un atacante.
const AGENT_PROMPT_EDIT_PASSWORD = "bit2027";

/**
 * Hace editable el system prompt del orquestador (spec pedido por usuario) — versionado igual
 * que /admin/skills: lectura abierta a cualquier usuario autenticado (la UI de Admin la usa,
 * pero no es dato sensible de negocio), escritura solo admin. Nunca sobreescribe: cada cambio
 * crea una versión nueva y la activa, dejando la anterior como historial para poder revertir
 * (copiando su contenido de vuelta al editor y guardando de nuevo) si un cambio rompe el
 * comportamiento del agente.
 */
export default async function agentPromptRoutes(app: FastifyInstance) {
  app.get("/admin/agent-prompt", async () => {
    const [active] = await unwrap<AgentPromptVersionRow[]>(
      "select:agent_prompt_versions:active",
      db.from("agent_prompt_versions").select().eq("is_active", true).limit(1)
    );
    return active ?? null;
  });

  app.get("/admin/agent-prompt/versions", async () =>
    unwrap<AgentPromptVersionRow[]>("select:agent_prompt_versions:all", db.from("agent_prompt_versions").select().order("version", { ascending: false }))
  );

  app.post("/admin/agent-prompt/versions", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = CreateVersionBody.parse(req.body);
    if (body.password !== AGENT_PROMPT_EDIT_PASSWORD) {
      reply.code(403);
      return { error: "Password incorrecto." };
    }

    const existing = await unwrap<AgentPromptVersionRow[]>(
      "select:agent_prompt_versions:latest",
      db.from("agent_prompt_versions").select().order("version", { ascending: false }).limit(1)
    );
    const nextVersion = (existing[0]?.version ?? 0) + 1;

    await unwrap("deactivate:agent_prompt_versions", db.from("agent_prompt_versions").update({ is_active: false }).eq("is_active", true).select());
    const [created] = await unwrap<AgentPromptVersionRow[]>(
      "insert:agent_prompt_versions",
      db
        .from("agent_prompt_versions")
        .insert([{ content: body.content, version: nextVersion, is_active: true, note: body.note ?? null, created_by: req.userId }])
        .select()
    );
    invalidateAgentPromptCache();
    reply.code(201);
    return created;
  });
}
