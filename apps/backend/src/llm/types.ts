/**
 * Tipos canónicos del transporte LLM, agnósticos de proveedor. El orquestador, las Skills
 * y el Learning Agent programan contra estos tipos — nunca contra el SDK de un proveedor
 * concreto. Hoy el único `LlmProvider` es OpenRouter (formato OpenAI-compatible), pero
 * cambiar de proveedor en el futuro es implementar esta misma interfaz, no reescribir
 * el resto del sistema.
 */

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmTextBlock {
  type: "text";
  text: string;
}

export interface LlmToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock;

export interface LlmMessage {
  role: LlmRole;
  content: LlmContentBlock[];
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export type LlmStopReason = "end_turn" | "tool_use" | "max_tokens";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  content: LlmContentBlock[];
  stopReason: LlmStopReason;
  usage: LlmUsage;
}

export interface LlmToolChoice {
  /** 'auto' (default del modelo) | 'required' (debe llamar alguna tool) | 'tool' (debe llamar `toolName`). */
  type: "auto" | "required" | "tool";
  toolName?: string;
}

export interface LlmCompleteParams {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  toolChoice?: LlmToolChoice;
  maxTokens?: number;
  /** Sobreescribe el modelo por defecto del provider para esta llamada puntual. */
  model?: string;
}

export interface LlmProvider {
  readonly name: string;
  complete(params: LlmCompleteParams): Promise<LlmResponse>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
