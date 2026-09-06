import type { FastifyInstance } from "fastify";
import { db } from "../../db/insforge-client.js";

/**
 * KPIs del home (spec pedido por usuario) — 3 conteos reales para las cajas sobre el grid de
 * opciones. Se usa `{count:"exact", head:true}` (no trae filas, solo el total) en vez de listar y
 * contar en el cliente — evita el límite de 100 filas que sí tiene `GET /estimates`, que sería un
 * conteo silenciosamente incorrecto si algún día hay más de 100 estimaciones.
 */
export default async function homeRoutes(app: FastifyInstance) {
  app.get("/home/summary", async () => {
    const [pendingRequirements, totalEstimates, totalProjects] = await Promise.all([
      // "Pendiente de estimar" = no llegó todavía a status "estimated" (spec RequirementRow.status).
      db.from("requirements").select("id", { count: "exact", head: true }).in("status", ["new", "in_estimation"]),
      db.from("project_estimates").select("id", { count: "exact", head: true }),
      db.from("projects").select("id", { count: "exact", head: true }),
    ]);

    return {
      pendingRequirements: pendingRequirements.count ?? 0,
      totalEstimates: totalEstimates.count ?? 0,
      totalProjects: totalProjects.count ?? 0,
    };
  });
}
