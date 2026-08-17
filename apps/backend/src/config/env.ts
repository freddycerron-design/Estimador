import "dotenv/config";
import { z } from "zod";

/**
 * Validación de variables de entorno. Falla rápido y explícito al arrancar si falta algo,
 * en vez de fallar más tarde con un error críptico a mitad de un request.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  INSFORGE_BASE_URL: z.string().url(),
  INSFORGE_ANON_KEY: z.string().min(1),
  // Key con privilegios elevados, usada server-side únicamente (nunca expuesta al frontend).
  INSFORGE_SERVICE_KEY: z.string().min(1),

  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY es obligatoria (ver .env.example)"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),

  LLM_PROVIDER: z.enum(["openrouter"]).default("openrouter"),
  LLM_MODEL_ORCHESTRATOR: z.string().default("anthropic/claude-sonnet-5"),
  LLM_MODEL_LEARNING_AGENT: z.string().default("anthropic/claude-opus-5"),
  LLM_MODEL_EMBEDDING: z.string().default("openai/text-embedding-3-small"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Configuración de entorno inválida — revisar .env contra .env.example");
}

export const env = parsed.data;
