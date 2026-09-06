import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, unwrap, unwrapNullable } from "../../db/insforge-client.js";
import type { RequirementRow, RequirementAttachmentRow } from "../../db/types.js";
import { parseRequirementsSpreadsheet, importRequirementRows, buildRequirementsImportTemplateBuffer } from "./import.js";
import { extractAttachmentText } from "./attachment-extraction.js";
import { uploadRequirementAttachment, deleteRequirementAttachmentFile } from "../../db/storage.js";

const RequirementBody = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  projectType: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  technologies: z.array(z.string()).default([]),
  modules: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  numUsers: z.number().nullable().optional(),
  numInterfaces: z.number().nullable().optional(),
  complexity: z.enum(["low", "medium", "high", "very_high"]).nullable().optional(),
});

export default async function requirementsRoutes(app: FastifyInstance) {
  // Búsqueda simple por título, descripción O código (REQ-<number>) — el SDK no expone `.or()`,
  // se hacen queries separadas y se combinan. El código (spec pedido por usuario: buscar por
  // "código de requerimiento") se busca por igualdad exacta sobre `number`, no ilike — es una
  // columna numérica, y una búsqueda parcial de números (ej. "4" encontrando REQ-42) sería más
  // confusa que útil para un código. Acepta el número solo ("42") o con el prefijo que se muestra
  // en pantalla ("REQ-42", sin distinguir mayúsculas/minúsculas ni espacios alrededor del guion).
  app.get("/requirements", async (req) => {
    const query = req.query as { q?: string; status?: string };

    if (query.q) {
      const pattern = `%${query.q}%`;
      const numberMatch = query.q.trim().match(/^req[\s-]*(\d+)$|^(\d+)$/i);
      const asNumber = numberMatch ? Number(numberMatch[1] ?? numberMatch[2]) : null;

      const [byTitle, byDescription, byNumber] = await Promise.all([
        unwrap<RequirementRow[]>("select:requirements:by_title", db.from("requirements").select().ilike("title", pattern).order("created_at", { ascending: false })),
        unwrap<RequirementRow[]>("select:requirements:by_description", db.from("requirements").select().ilike("description", pattern).order("created_at", { ascending: false })),
        asNumber !== null
          ? unwrap<RequirementRow[]>("select:requirements:by_number", db.from("requirements").select().eq("number", asNumber))
          : Promise.resolve<RequirementRow[]>([]),
      ]);
      const byId = new Map([...byTitle, ...byDescription, ...byNumber].map((r) => [r.id, r]));
      let results = [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      // Un requerimiento ya estimado se retira del catálogo por defecto (spec pedido por usuario:
      // pasa a vivir en Estimaciones) — salvo que se pida explícitamente ese status.
      results = query.status ? results.filter((r) => r.status === query.status) : results.filter((r) => r.status !== "estimated");
      return results;
    }

    let builder = db.from("requirements").select().order("created_at", { ascending: false });
    builder = query.status ? builder.eq("status", query.status) : builder.neq("status", "estimated");
    return unwrap<RequirementRow[]>("select:requirements:list", builder);
  });

  app.get("/requirements/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const requirement = await unwrapNullable<RequirementRow | null>("select:requirements:one", db.from("requirements").select().eq("id", id).maybeSingle());
    if (!requirement) {
      reply.code(404);
      return { error: "Requerimiento no encontrado" };
    }
    return requirement;
  });

  app.get("/requirements/by-number/:number", async (req, reply) => {
    const { number } = req.params as { number: string };
    const requirement = await unwrapNullable<RequirementRow | null>(
      "select:requirements:by_number",
      db.from("requirements").select().eq("number", Number(number)).maybeSingle()
    );
    if (!requirement) {
      reply.code(404);
      return { error: `No existe el requerimiento REQ-${number}` };
    }
    return requirement;
  });

  app.post("/requirements", async (req, reply) => {
    const body = RequirementBody.parse(req.body);
    const [created] = await unwrap<RequirementRow[]>(
      "insert:requirements",
      db
        .from("requirements")
        .insert([
          {
            title: body.title,
            description: body.description,
            project_type: body.projectType ?? null,
            industry: body.industry ?? null,
            technologies: body.technologies,
            modules: body.modules,
            integrations: body.integrations,
            num_users: body.numUsers ?? null,
            num_interfaces: body.numInterfaces ?? null,
            complexity: body.complexity ?? null,
            status: "new",
            created_by: req.userId,
          },
        ])
        .select()
    );
    reply.code(201);
    return created;
  });

  app.put("/requirements/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = RequirementBody.parse(req.body);
    const existing = await unwrapNullable<RequirementRow | null>("select:requirements:check", db.from("requirements").select().eq("id", id).maybeSingle());
    if (!existing) {
      reply.code(404);
      return { error: "Requerimiento no encontrado" };
    }
    const [updated] = await unwrap<RequirementRow[]>(
      "update:requirements",
      db
        .from("requirements")
        .update({
          title: body.title,
          description: body.description,
          project_type: body.projectType ?? null,
          industry: body.industry ?? null,
          technologies: body.technologies,
          modules: body.modules,
          integrations: body.integrations,
          num_users: body.numUsers ?? null,
          num_interfaces: body.numInterfaces ?? null,
          complexity: body.complexity ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
    );
    return updated;
  });

  app.delete("/requirements/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const conversationsUsing = await db.from("conversations").select("id", { count: "exact", head: true }).eq("requirement_id", id);
    if ((conversationsUsing.count ?? 0) > 0) {
      reply.code(409);
      return { error: `No se puede eliminar: ${conversationsUsing.count} conversación(es)/estimación(es) ya se generaron a partir de este requerimiento.` };
    }
    await unwrapNullable("delete:requirements", db.from("requirements").delete().eq("id", id));
    return { deleted: true };
  });

  app.get("/requirements/import/template", async (_req, reply) => {
    const buffer = buildRequirementsImportTemplateBuffer();
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="plantilla-requerimientos.csv"');
    return buffer;
  });

  app.post("/requirements/import", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      reply.code(400);
      return { error: "No se recibió ningún archivo (campo 'file' esperado, multipart/form-data)" };
    }
    const buffer = await file.toBuffer();
    let rows;
    try {
      rows = parseRequirementsSpreadsheet(buffer);
    } catch (err) {
      reply.code(400);
      return { error: `No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (rows.length === 0) {
      reply.code(400);
      return { error: "El archivo no tiene filas de datos" };
    }
    return importRequirementRows(rows, req.userId);
  });

  // --- Adjuntos con detalle del requerimiento (spec pedido por usuario: se leen durante la
  // estimación, no solo se archivan) ---

  app.get("/requirements/:id/attachments", async (req) => {
    const { id } = req.params as { id: string };
    return unwrap<RequirementAttachmentRow[]>(
      "select:requirement_attachments",
      db.from("requirement_attachments").select().eq("requirement_id", id).order("created_at", { ascending: true })
    );
  });

  app.post("/requirements/:id/attachments", async (req, reply) => {
    const { id } = req.params as { id: string };
    const requirement = await unwrapNullable<RequirementRow | null>("select:requirements:check_attach", db.from("requirements").select().eq("id", id).maybeSingle());
    if (!requirement) {
      reply.code(404);
      return { error: "Requerimiento no encontrado" };
    }

    const file = await req.file();
    if (!file) {
      reply.code(400);
      return { error: "No se recibió ningún archivo (campo 'file' esperado, multipart/form-data)" };
    }
    const buffer = await file.toBuffer();
    if (buffer.length === 0) {
      reply.code(400);
      return { error: "El archivo está vacío" };
    }

    const extraction = await extractAttachmentText(buffer, file.filename, file.mimetype);
    const { url: storageUrl, key: storageKey } = await uploadRequirementAttachment(buffer, file.filename, file.mimetype, id);

    const [created] = await unwrap<RequirementAttachmentRow[]>(
      "insert:requirement_attachments",
      db
        .from("requirement_attachments")
        .insert([
          {
            requirement_id: id,
            filename: file.filename,
            mime_type: file.mimetype,
            size_bytes: buffer.length,
            storage_url: storageUrl,
            storage_key: storageKey,
            extracted_text: extraction.text,
            extraction_status: extraction.status,
            extraction_note: extraction.note,
            uploaded_by: req.userId,
          },
        ])
        .select()
    );
    reply.code(201);
    return created;
  });

  app.delete("/requirements/:id/attachments/:attachmentId", async (req, reply) => {
    const { attachmentId } = req.params as { id: string; attachmentId: string };
    const attachment = await unwrapNullable<RequirementAttachmentRow | null>(
      "select:requirement_attachments:one",
      db.from("requirement_attachments").select().eq("id", attachmentId).maybeSingle()
    );
    if (!attachment) {
      reply.code(404);
      return { error: "Adjunto no encontrado" };
    }
    await unwrapNullable("delete:requirement_attachments", db.from("requirement_attachments").delete().eq("id", attachmentId));
    await deleteRequirementAttachmentFile(attachment.storage_key);
    return { deleted: true };
  });
}
