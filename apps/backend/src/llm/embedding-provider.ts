import OpenAI from "openai";
import type { EmbeddingProvider } from "./types.js";

/**
 * Embeddings vía OpenRouter (mismo transporte OpenAI-compatible que el LlmProvider de chat).
 * Dimensión fija en 1536 porque el schema (`vector(1536)` en todas las columnas embedding)
 * asume `openai/text-embedding-3-small`. Si se cambia el modelo, hay que migrar el schema.
 */
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openrouter";
  readonly dimensions = 1536;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; baseUrl: string; model: string }) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseUrl });
    this.model = opts.model;
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text]);
    if (!vector) throw new Error("embed(): no se generó ningún vector");
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
