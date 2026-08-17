import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, unwrap, unwrapNullable, InsforgeQueryError } from "../../db/insforge-client.js";
import type { ProjectRow, ProjectEstimateRow, EstimateLineItemRow, ProjectFeatureRow } from "../../db/types.js";
import { parseSpreadsheet, importRows, buildImportTemplateBuffer, type ImportRow } from "./import.js";
import { createEmbeddingProvider } from "../../llm/provider-factory.js";
import { uploadImportFile } from "../../db/storage.js";

const ProjectUpsertBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  projectType: z.string().min(1),
  industry: z.string().nullable().optional(),
  technologies: z.array(z.string()).default([]),
  modules: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  teamSize: z.number().nullable().optional(),
  numUsers: z.number().nullable().optional(),
  numInterfaces: z.number().nullable().optional(),
  complexity: z.enum(["low", "medium", "high", "very_high"]).nullable().optional(),
  durationWeeks: z.number().nullable().optional(),
  actualCost: z.number().nullable().optional(),
  totalHours: z.number().nullable().optional(),
  risks: z.array(z.string()).default([]),
  lessonsLearned: z.string().nullable().optional(),
});

const ActualsBody = z.object({
  actualEffortHours: z.record(z.string(), z.record(z.string(), z.number())),
  actualDurationWeeks: z.number().optional(),
  actualCost: z.number().optional(),
  completedAt: z.string().optional(), // YYYY-MM-DD
  notes: z.string().optional(),
});

function sumHours(effort: Record<string, Record<string, number>>): number {
  let total = 0;
  for (const roles of Object.values(effort)) for (const h of Object.values(roles)) total += h;
  return total;
}

function variancePct(actual: number, estimated: number): number | null {
  if (!estimated) return null;
  return Math.round(((actual - estimated) / estimated) * 1000) / 10; // 1 decimal
}

export default async function projectsRoutes(app: FastifyInstance) {
  app.get("/projects", async (req) => {
    const query = req.query as { status?: string };
    let builder = db.from("projects").select().order("created_at", { ascending: false });
    if (query.status) builder = builder.eq("status", query.status);
    return unwrap<ProjectRow[]>("select:projects:list", builder);
  });

  app.get("/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await unwrapNullable<ProjectRow | null>("select:projects:one", db.from("projects").select().eq("id", id).maybeSingle());
    if (!project) {
      reply.code(404);
      return { error: "Proyecto no encontrado" };
    }
    const features = await unwrap<ProjectFeatureRow[]>("select:project_features:one", db.from("project_features").select().eq("project_id", id));
    return { ...project, features };
  });

  /**
   * Registrar el resultado real de un proyecto terminado y compararlo contra su estimación
   * original (spec §18, Criterio 6). Busca la estimación 'final' más reciente ligada a este
   * proyecto (creada automáticamente al generar el reporte, ver agent/estimate-persistence.ts).
   */
  app.post("/projects/:id/actuals", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = ActualsBody.parse(req.body);

    const project = await unwrapNullable<ProjectRow | null>("select:projects:check", db.from("projects").select().eq("id", id).maybeSingle());
    if (!project) {
      reply.code(404);
      return { error: "Proyecto no encontrado" };
    }

    const estimates = await unwrap<ProjectEstimateRow[]>(
      "select:project_estimates:for_project",
      db.from("project_estimates").select().eq("project_id", id).eq("status", "final").order("created_at", { ascending: false }).limit(1)
    );
    const estimate = estimates[0];

    const actualTotalHours = sumHours(body.actualEffortHours);
    let effortVariancePct: number | null = null;
    let durationVariancePct: number | null = null;
    let costVariancePct: number | null = null;

    if (estimate) {
      const lineItems = await unwrap<EstimateLineItemRow[]>(
        "select:estimate_line_items:for_variance",
        db.from("estimate_line_items").select().eq("estimate_id", estimate.id)
      );
      const estimatedTotalHours = lineItems.reduce((sum, li) => sum + Number(li.hours), 0);
      effortVariancePct = variancePct(actualTotalHours, estimatedTotalHours);
      if (body.actualDurationWeeks !== undefined && estimate.duration_weeks_probable) {
        durationVariancePct = variancePct(body.actualDurationWeeks, Number(estimate.duration_weeks_probable));
      }
      if (body.actualCost !== undefined && estimate.cost_probable) {
        costVariancePct = variancePct(body.actualCost, Number(estimate.cost_probable));
      }
    }

    const [actualRow] = await unwrap<{ id: string }[]>(
      "insert:project_actuals",
      db
        .from("project_actuals")
        .insert([
          {
            project_id: id,
            estimate_id: estimate?.id ?? null,
            actual_effort_hours: body.actualEffortHours,
            actual_duration_weeks: body.actualDurationWeeks ?? null,
            actual_cost: body.actualCost ?? null,
            effort_variance_pct: effortVariancePct,
            duration_variance_pct: durationVariancePct,
            cost_variance_pct: costVariancePct,
            completed_at: body.completedAt ?? new Date().toISOString().slice(0, 10),
            notes: body.notes ?? null,
          },
        ])
        .select("id")
    );

    await unwrap(
      "update:projects:completed",
      db.from("projects").update({ status: "completed", actual_cost: body.actualCost ?? null, updated_at: new Date().toISOString() }).eq("id", id).select()
    );

    // Dispara el ciclo de aprendizaje (spec §18-19): el Learning Agent procesará este evento.
    await unwrap(
      "insert:learning_events:variance",
      db
        .from("learning_events")
        .insert([
          {
            type: "variance_detected",
            source_estimate_id: estimate?.id ?? null,
            payload: { projectId: id, actualId: actualRow?.id, effortVariancePct, durationVariancePct, costVariancePct },
          },
        ])
        .select()
    );

    reply.code(201);
    return { actualId: actualRow?.id, effortVariancePct, durationVariancePct, costVariancePct, matchedEstimateId: estimate?.id ?? null };
  });

  // --- CRUD de mantenimiento de proyectos históricos ---

  app.post("/projects", async (req, reply) => {
    const body = ProjectUpsertBody.parse(req.body);
    const importRow: ImportRow = {
      name: body.name,
      description: body.description,
      project_type: body.projectType,
      industry: body.industry ?? "",
      technologies: body.technologies.join(";"),
      modules: body.modules.join(";"),
      integrations: body.integrations.join(";"),
      team_size: body.teamSize ?? undefined,
      num_users: body.numUsers ?? undefined,
      num_interfaces: body.numInterfaces ?? undefined,
      complexity: body.complexity ?? undefined,
      duration_weeks: body.durationWeeks ?? undefined,
      actual_cost: body.actualCost ?? undefined,
      total_hours: body.totalHours ?? undefined,
      risks: body.risks.join(";"),
      lessons_learned: body.lessonsLearned ?? undefined,
    };
    const summary = await importRows([importRow]);
    const result = summary.results[0];
    if (!result || result.status === "skipped") {
      reply.code(400);
      return { error: result?.error ?? "No se pudo crear el proyecto" };
    }
    reply.code(201);
    return { id: result.projectId };
  });

  app.put("/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = ProjectUpsertBody.parse(req.body);

    const existing = await unwrapNullable<ProjectRow | null>("select:projects:check_update", db.from("projects").select().eq("id", id).maybeSingle());
    if (!existing) {
      reply.code(404);
      return { error: "Proyecto no encontrado" };
    }

    const embedder = createEmbeddingProvider();
    const embedding = await embedder.embed(
      [body.name, body.description, `Tecnologías: ${body.technologies.join(", ")}`, `Módulos: ${body.modules.join(", ")}`].join("\n")
    );

    await unwrap(
      "update:projects",
      db
        .from("projects")
        .update({
          name: body.name,
          description: body.description,
          project_type: body.projectType,
          industry: body.industry ?? null,
          technologies: body.technologies,
          team_size: body.teamSize ?? null,
          duration_weeks: body.durationWeeks ?? null,
          actual_cost: body.actualCost ?? null,
          embedding,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
    );

    // Reemplazar features: más simple y confiable que diffear campo a campo.
    // unwrapNullable (no unwrap): un DELETE sin filas que devolver trae `data: null` en éxito,
    // no es un error — usar `unwrap` ahí lanzaría falsos positivos.
    await unwrapNullable("delete:project_features:for_update", db.from("project_features").delete().eq("project_id", id));
    const featureRows = [
      body.modules.length > 0 && { project_id: id, category: "functional", feature_key: "modules", feature_value: body.modules, extracted_by: "manual", provenance: "FACTUAL" },
      body.numUsers != null && { project_id: id, category: "functional", feature_key: "num_users", feature_value: body.numUsers, extracted_by: "manual", provenance: "FACTUAL" },
      { project_id: id, category: "technical", feature_key: "technologies", feature_value: body.technologies, extracted_by: "manual", provenance: "FACTUAL" },
      body.complexity && { project_id: id, category: "technical", feature_key: "complexity", feature_value: body.complexity, extracted_by: "manual", provenance: "FACTUAL" },
      body.integrations.length > 0 && { project_id: id, category: "integration", feature_key: "integrations", feature_value: body.integrations, extracted_by: "manual", provenance: "FACTUAL" },
      body.numInterfaces != null && { project_id: id, category: "integration", feature_key: "num_interfaces", feature_value: body.numInterfaces, extracted_by: "manual", provenance: "FACTUAL" },
      body.risks.length > 0 && { project_id: id, category: "non_functional", feature_key: "risks", feature_value: body.risks, extracted_by: "manual", provenance: "FACTUAL" },
    ].filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (featureRows.length > 0) {
      await unwrap("insert:project_features:for_update", db.from("project_features").insert(featureRows).select());
    }

    return { id, updated: true };
  });

  app.delete("/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    // Varias tablas referencian projects(id) SIN cascada a propósito (reference_projects,
    // project_estimates, project_actuals, experiences) — perder ese rastro de auditoría
    // silenciosamente sería peor que bloquear el borrado. Se comprueba cada una explícitamente
    // para poder decir EXACTAMENTE qué lo bloquea, en vez de adivinar a partir del texto del
    // error de Postgres.
    const [asReference, ownEstimates, actuals, experiences] = await Promise.all([
      db.from("reference_projects").select("id", { count: "exact", head: true }).eq("reference_project_id", id),
      db.from("project_estimates").select("id", { count: "exact", head: true }).eq("project_id", id),
      db.from("project_actuals").select("id", { count: "exact", head: true }).eq("project_id", id),
      db.from("experiences").select("id", { count: "exact", head: true }).eq("project_id", id),
    ]);

    const blockers: string[] = [];
    if ((asReference.count ?? 0) > 0) blockers.push(`${asReference.count} estimación(es) que lo usaron como referencia`);
    if ((ownEstimates.count ?? 0) > 0) blockers.push(`${ownEstimates.count} estimación(es) propia(s)`);
    if ((actuals.count ?? 0) > 0) blockers.push(`${actuals.count} registro(s) de resultados reales`);
    if ((experiences.count ?? 0) > 0) blockers.push(`${experiences.count} lección(es) aprendida(s) capturada(s)`);

    if (blockers.length > 0) {
      reply.code(409);
      return { error: `No se puede eliminar: está referenciado por ${blockers.join(", ")}. Elimina esos registros primero si de verdad quieres borrar el proyecto.` };
    }

    try {
      await unwrapNullable("delete:projects", db.from("projects").delete().eq("id", id));
      return { deleted: true };
    } catch (err) {
      reply.code(500);
      return { error: "No se pudo eliminar el proyecto", detail: err instanceof InsforgeQueryError ? err.cause : String(err) };
    }
  });

  // --- Importación masiva desde Excel/CSV (spec §28) ---

  app.get("/projects/import/template", async (_req, reply) => {
    const buffer = buildImportTemplateBuffer();
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="plantilla-proyectos-historicos.csv"');
    return buffer;
  });

  app.post("/projects/import", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      reply.code(400);
      return { error: "No se recibió ningún archivo (campo 'file' esperado, multipart/form-data)" };
    }
    const buffer = await file.toBuffer();
    let rows: ImportRow[];
    try {
      rows = parseSpreadsheet(buffer);
    } catch (err) {
      reply.code(400);
      return { error: `No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (rows.length === 0) {
      reply.code(400);
      return { error: "El archivo no tiene filas de datos" };
    }
    const [summary, sourceFileUrl] = await Promise.all([
      importRows(rows),
      uploadImportFile(buffer, file.filename, file.mimetype),
    ]);
    return { ...summary, sourceFileUrl };
  });
}
