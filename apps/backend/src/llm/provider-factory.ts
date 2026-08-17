import { env } from "../config/env.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import { OpenRouterEmbeddingProvider } from "./embedding-provider.js";
import type { LlmProvider, EmbeddingProvider } from "./types.js";

/**
 * Único punto donde se decide QUÉ proveedor de transporte se usa. El resto del sistema
 * (orquestador, Skills, Learning Agent) solo conoce `LlmProvider`/`EmbeddingProvider`.
 * Añadir un proveedor nuevo en el futuro: implementar la interfaz + agregar un `case` aquí,
 * sin tocar nada más.
 */
export function createOrchestratorProvider(): LlmProvider {
  return createProvider(env.LLM_MODEL_ORCHESTRATOR);
}

export function createLearningAgentProvider(): LlmProvider {
  return createProvider(env.LLM_MODEL_LEARNING_AGENT);
}

function createProvider(model: string): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case "openrouter":
      return new OpenRouterProvider({
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: env.OPENROUTER_BASE_URL,
        defaultModel: model,
      });
    default:
      throw new Error(`LLM_PROVIDER no soportado: ${env.LLM_PROVIDER}`);
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  switch (env.LLM_PROVIDER) {
    case "openrouter":
      return new OpenRouterEmbeddingProvider({
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: env.OPENROUTER_BASE_URL,
        model: env.LLM_MODEL_EMBEDDING,
      });
    default:
      throw new Error(`LLM_PROVIDER no soportado: ${env.LLM_PROVIDER}`);
  }
}
