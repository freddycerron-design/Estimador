import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, unwrap, unwrapNullable } from "../../db/insforge-client.js";
import type { ProjectEstimateRow, EstimateLineItemRow, ReferenceProjectRow } from "../../db/types.js";
import { loadReferenceLookup } from "../../config/reference-lookup.js";
import { loadEstimateExportData } from "./export-data.js";
import { buildEstimateExcel } from "./excel-exporter.js";
import { buildEstimatePptx } from "./pptx-exporter.js";

const FeedbackBody = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comments: z.string().optional(),
  categories: z.array(z.string()).optional(),
});

export default async function estimatesRoutes(app: FastifyInstance) {
  app.get("/estimates", async () => {
    const estimates = await unwrap<ProjectEstimateRow[]>(
      "select:project_estimates:list",
      db.from("project_estimates").select().order("created_at", { ascending: false }).limit(100)
    );
    const projectIds = [...new Set(estimates.map((e) => e.project_id).filter((x): x is string => !!x))];
    const projects =
      projectIds.length > 0
        ? await unwrap<{ id: string; name: string }[]>("select:projects:names_for_estimates", db.from("projects").select("id, name").in("id", projectIds))
        : [];
    const nameById = new Map(projects.map((p) => [p.id, p.name]));
    return estimates.map((e) => ({ ...e, projectName: e.project_id ? (nameById.get(e.project_id) ?? null) : null }));
  });

  app.get("/estimates/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const estimate = await unwrapNullable<ProjectEstimateRow | null>(
      "select:project_estimates:one",
      db.from("project_estimates").select().eq("id", id).maybeSingle()
    );
    if (!estimate) {
      reply.code(404);
      return { error: "Estimación no encontrada" };
    }

    const [lineItemRows, referenceRows, lookup] = await Promise.all([
      unwrap<EstimateLineItemRow[]>("select:estimate_line_items", db.from("estimate_line_items").select().eq("estimate_id", id)),
      unwrap<ReferenceProjectRow[]>("select:reference_projects", db.from("reference_projects").select().eq("estimate_id", id)),
      loadReferenceLookup(),
    ]);

    const referenceProjectIds = referenceRows.map((r) => r.reference_project_id);
    const referenceProjects =
      referenceProjectIds.length > 0
        ? await unwrap<{ id: string; name: string }[]>(
            "select:projects:names",
            db.from("projects").select("id, name").in("id", referenceProjectIds)
          )
        : [];
    const nameById = new Map(referenceProjects.map((p) => [p.id, p.name]));

    // Orden de presentación pedido por usuario: agrupado por fase, en el orden fijo de
    // `phases.sort_order` (Análisis, Diseño, Arquitectura, Desarrollo, Integración, Pruebas, QA,
    // Seguridad, Despliegue, Gestión de Proyecto, Capacitación, Soporte/Hypercare) — dentro de
    // cada fase, de mayor a menor esfuerzo. Fases desconocidas (no debería pasar) van al final.
    const sortedLineItems = lineItemRows
      .map((li) => ({
        ...li,
        phaseName: lookup.phasesById.get(li.phase_id)?.name ?? li.phase_id,
        phaseSortOrder: lookup.phasesById.get(li.phase_id)?.sort_order ?? 999,
        roleName: lookup.rolesById.get(li.role_id)?.name ?? li.role_id,
      }))
      .sort((a, b) => a.phaseSortOrder - b.phaseSortOrder || Number(b.hours) - Number(a.hours));

    return {
      estimate,
      lineItems: sortedLineItems,
      referenceProjects: referenceRows.map((r) => ({ ...r, projectName: nameById.get(r.reference_project_id) ?? r.reference_project_id })),
    };
  });

  app.post("/estimates/:id/feedback", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = FeedbackBody.parse(req.body ?? {});
    const estimate = await unwrapNullable<ProjectEstimateRow | null>(
      "select:project_estimates:check",
      db.from("project_estimates").select().eq("id", id).maybeSingle()
    );
    if (!estimate) {
      reply.code(404);
      return { error: "Estimación no encontrada" };
    }

    const [feedback] = await unwrap(
      "insert:feedback",
      db
        .from("feedback")
        .insert([{ estimate_id: id, user_id: req.userId, rating: body.rating ?? null, comments: body.comments ?? null, categories: body.categories ?? null }])
        .select()
    );

    // Registrar como learning_event para que el Learning Agent lo procese más adelante (spec §18-19).
    await unwrap(
      "insert:learning_events:feedback",
      db
        .from("learning_events")
        .insert([{ type: "feedback_received", source_estimate_id: id, payload: { feedbackId: (feedback as { id: string }).id, rating: body.rating, categories: body.categories } }])
        .select()
    );

    reply.code(201);
    return feedback;
  });

  // --- Exportación (versión inicial, a refinar con plantilla — spec: Business Case / Propuesta comercial / etc.) ---

  app.get("/estimates/:id/export/excel", async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await loadEstimateExportData(id);
    if (!data) {
      reply.code(404);
      return { error: "Estimación no encontrada" };
    }
    const buffer = buildEstimateExcel(data);
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", `attachment; filename="estimacion-${id.slice(0, 8)}.xlsx"`);
    return buffer;
  });

  app.get("/estimates/:id/export/pptx", async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await loadEstimateExportData(id);
    if (!data) {
      reply.code(404);
      return { error: "Estimación no encontrada" };
    }
    const buffer = await buildEstimatePptx(data);
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    reply.header("Content-Disposition", `attachment; filename="estimacion-${id.slice(0, 8)}.pptx"`);
    return buffer;
  });
}
