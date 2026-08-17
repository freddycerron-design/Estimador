import type { FastifyInstance } from "fastify";
import { db, unwrapNullable } from "../../db/insforge-client.js";
import type { UserRow } from "../../db/types.js";

/** Para que el frontend sepa si mostrar la sección de Administración (según app_role). */
export default async function meRoutes(app: FastifyInstance) {
  app.get("/me", async (req) => {
    const user = await unwrapNullable<UserRow | null>("select:users:me", db.from("users").select().eq("id", req.userId).maybeSingle());
    return user;
  });
}
