import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./config/env.js";
import { db } from "./db/insforge-client.js";
import insforgeAuthPlugin from "./plugins/insforge-auth.js";
import conversationsRoutes from "./modules/conversations/routes.js";
import estimatesRoutes from "./modules/estimates/routes.js";
import projectsRoutes from "./modules/projects/routes.js";
import adminConfigRoutes from "./modules/admin-config/routes.js";
import learningRoutes from "./modules/learning/routes.js";
import requirementsRoutes from "./modules/requirements/routes.js";
import meRoutes from "./modules/me/routes.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn",
    },
  });

  app.register(cors, { origin: true });
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB máx. para import Excel/CSV

  // Por defecto, Fastify rechaza con 400 un POST/DELETE sin body si el cliente igual manda
  // `Content-Type: application/json` (aunque la ruta ni siquiera lea req.body) — le pasó a
  // "correr ciclo de aprendizaje", aprobar/activar propuestas y eliminar proyectos, todos
  // POST/DELETE sin cuerpo. Tratamos un body vacío como `{}` en vez de error.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body || (typeof body === "string" && body.trim() === "")) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.register(insforgeAuthPlugin);
  app.register(conversationsRoutes);
  app.register(estimatesRoutes);
  app.register(projectsRoutes);
  app.register(adminConfigRoutes);
  app.register(learningRoutes);
  app.register(requirementsRoutes);
  app.register(meRoutes);

  app.get("/health", async () => ({ status: "ok", env: env.NODE_ENV }));

  // Verifica conectividad real contra InsForge (no solo que el proceso arrancó).
  app.get("/health/db", async (_req, reply) => {
    const { error, count } = await db.from("system_settings").select("key", { count: "exact", head: true });
    if (error) {
      reply.code(503);
      return { status: "error", error };
    }
    return { status: "ok", system_settings_count: count };
  });

  return app;
}
