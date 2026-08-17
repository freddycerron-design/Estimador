import { createClient } from "@insforge/sdk";
import { env } from "../config/env.js";

/**
 * Cliente InsForge server-side, usando la key con privilegios elevados
 * (nunca expuesta al frontend). El frontend solo usa InsForge Auth SDK con la
 * anon key para login/sesión — todo acceso a datos de negocio pasa por este backend.
 */
export const insforge = createClient({
  baseUrl: env.INSFORGE_BASE_URL,
  anonKey: env.INSFORGE_SERVICE_KEY,
});

export const db = insforge.database;

export class InsforgeQueryError extends Error {
  constructor(
    public readonly operation: string,
    public readonly cause: unknown
  ) {
    super(`InsForge query failed [${operation}]: ${JSON.stringify(cause)}`);
    this.name = "InsforgeQueryError";
  }
}

/**
 * Espera un resultado `{data, error}` del SDK y lanza si hubo error, devolviendo
 * `data` ya tipado según el llamador. Centraliza el manejo de errores del SDK
 * (que nunca lanza excepciones por sí mismo) para no repetir `if (error) throw` everywhere.
 */
export async function unwrap<T>(
  operation: string,
  result: PromiseLike<{ data: T | null; error: unknown }>
): Promise<T> {
  const { data, error } = await result;
  if (error) throw new InsforgeQueryError(operation, error);
  if (data === null) {
    throw new InsforgeQueryError(operation, "data inesperadamente null sin error");
  }
  return data;
}

/** Igual que `unwrap`, pero permite null como resultado válido (ej. `.maybeSingle()`). */
export async function unwrapNullable<T>(
  operation: string,
  result: PromiseLike<{ data: T | null; error: unknown }>
): Promise<T | null> {
  const { data, error } = await result;
  if (error) throw new InsforgeQueryError(operation, error);
  return data;
}

/** Invoca una función Postgres (RPC) — usado sobre todo para búsqueda vectorial (spec §5). */
export async function rpc<T>(functionName: string, args?: Record<string, unknown>): Promise<T> {
  return unwrap(`rpc:${functionName}`, db.rpc(functionName, args) as PromiseLike<{ data: T | null; error: unknown }>);
}
