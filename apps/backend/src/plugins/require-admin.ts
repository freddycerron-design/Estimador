import type { FastifyRequest, FastifyReply } from "fastify";
import { db, unwrapNullable } from "../db/insforge-client.js";
import type { UserRow } from "../db/types.js";

/**
 * Guard para rutas de administración (parámetros del sistema, tarifas, pesos de similitud).
 * Antes de desplegar, estas rutas NO deben quedar abiertas a cualquier usuario autenticado
 * — solo `app_role='admin'` puede modificarlas (la lectura sigue abierta a cualquier usuario
 * logueado, para que la UI pueda mostrar los valores vigentes).
 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = await unwrapNullable<UserRow | null>("select:users:role_check", db.from("users").select().eq("id", req.userId).maybeSingle());
  if (!user || user.app_role !== "admin") {
    reply.code(403);
    reply.send({ error: "Se requiere rol de administrador para esta acción" });
    return false;
  }
  return true;
}
