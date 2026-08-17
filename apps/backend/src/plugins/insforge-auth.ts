import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { db, unwrap, unwrapNullable } from "../db/insforge-client.js";
import type { UserRow } from "../db/types.js";
import { env } from "../config/env.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

interface InsforgeSessionUser {
  id: string;
  email: string;
  role?: string;
}

/**
 * Verifica el JWT emitido por InsForge Auth contra `GET /api/auth/sessions/current`
 * (confirmado vía fetch-sdk-docs rest-api/auth). Es una llamada HTTP simple y sin estado —
 * no requiere el SDK completo de InsForge, que está pensado para gestión de sesión del lado
 * cliente, no para verificación stateless por request en un backend.
 */
async function verifyInsforgeToken(accessToken: string): Promise<InsforgeSessionUser | null> {
  const res = await fetch(`${env.INSFORGE_BASE_URL}/api/auth/sessions/current`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: InsforgeSessionUser };
  return body.user ?? null;
}

export default fp(async function insforgeAuthPlugin(app: FastifyInstance) {
  app.addHook("preHandler", async (req: FastifyRequest, reply) => {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

    if (bearerToken) {
      const sessionUser = await verifyInsforgeToken(bearerToken);
      if (!sessionUser) {
        reply.code(401);
        throw new Error("Token de sesión inválido o expirado");
      }
      await ensureUser(sessionUser.id, sessionUser.email);
      req.userId = sessionUser.id;
      return;
    }

    // Sin token: solo se permite fuera de producción, como atajo de desarrollo local
    // (`x-user-id` simula un usuario ya autenticado) — nunca aceptar esto en producción.
    if (env.NODE_ENV === "production") {
      reply.code(401);
      throw new Error("Falta el header Authorization: Bearer <token>");
    }

    const headerUserId = req.headers["x-user-id"];
    const userId = typeof headerUserId === "string" && headerUserId.length > 0 ? headerUserId : "usr_dev_local";
    await ensureUser(userId, `${userId}@dev.local`);
    req.userId = userId;
  });
});

async function ensureUser(userId: string, email: string): Promise<void> {
  const existing = await unwrapNullable<UserRow | null>("select:users:one", db.from("users").select().eq("id", userId).maybeSingle());
  if (existing) return;
  await unwrap(
    "insert:users:auto",
    db
      .from("users")
      .insert([{ id: userId, email, name: email.split("@")[0], app_role: "estimator" }])
      .select()
  );
}
