import OpenAI from "openai";
import type {
  LlmProvider,
  LlmCompleteParams,
  LlmResponse,
  LlmMessage,
  LlmContentBlock,
  LlmToolDefinition,
  LlmToolChoice,
} from "../types.js";

/**
 * Transporte real del `LlmProvider`: OpenRouter, formato OpenAI-compatible Chat Completions
 * (InsForge no expone un passthrough nativo de la Messages API de Anthropic — aprovisiona
 * una key de OpenRouter). Los modelos Claude se siguen usando "por debajo"
 * (ej. `anthropic/claude-sonnet-5`), solo cambia el formato de transporte.
 */
export class OpenRouterProvider implements LlmProvider {
  readonly name = "openrouter";
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(opts: { apiKey: string; baseUrl: string; defaultModel: string }) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseUrl,
      defaultHeaders: {
        "X-Title": "Estimador",
      },
    });
    this.defaultModel = opts.defaultModel;
  }

  async complete(params: LlmCompleteParams): Promise<LlmResponse> {
    const model = params.model ?? this.defaultModel;
    const messages = toOpenAiMessages(params.system, params.messages);
    const tools = params.tools?.length ? toOpenAiTools(params.tools) : undefined;

    const completion = await this.client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: toOpenAiToolChoice(params.toolChoice),
      max_tokens: params.maxTokens ?? 4096,
    });

    return fromOpenAiCompletion(completion);
  }
}

function toOpenAiMessages(
  system: string,
  messages: LlmMessage[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }];

  for (const msg of messages) {
    if (msg.role === "tool") {
      // Cada tool_result se traduce a un mensaje OpenAI role:'tool' independiente.
      for (const block of msg.content) {
        if (block.type === "tool_result") {
          out.push({
            role: "tool",
            tool_call_id: block.toolUseId,
            content: block.content,
          });
        }
      }
      continue;
    }

    if (msg.role === "assistant") {
      const textParts = msg.content.filter((b): b is Extract<LlmContentBlock, { type: "text" }> => b.type === "text");
      const toolUses = msg.content.filter((b): b is Extract<LlmContentBlock, { type: "tool_use" }> => b.type === "tool_use");

      out.push({
        role: "assistant",
        content: textParts.length ? textParts.map((b) => b.text).join("\n") : null,
        tool_calls: toolUses.length
          ? toolUses.map((t) => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: JSON.stringify(t.input) },
            }))
          : undefined,
      });
      continue;
    }

    // role === 'user'
    const text = msg.content
      .filter((b): b is Extract<LlmContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    out.push({ role: "user", content: text });
  }

  return out;
}

function toOpenAiToolChoice(choice: LlmToolChoice | undefined): OpenAI.Chat.ChatCompletionToolChoiceOption | undefined {
  if (!choice || choice.type === "auto") return undefined;
  if (choice.type === "required") return "required";
  if (choice.type === "tool" && choice.toolName) {
    return { type: "function", function: { name: choice.toolName } };
  }
  return undefined;
}

function toOpenAiTools(tools: LlmToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

function fromOpenAiCompletion(completion: OpenAI.Chat.ChatCompletion): LlmResponse {
  const choice = completion.choices[0];
  if (!choice) {
    throw new Error("OpenRouter no devolvió ninguna choice en la respuesta");
  }

  const content: LlmContentBlock[] = [];
  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }
  for (const call of choice.message.tool_calls ?? []) {
    if (call.type !== "function") continue;
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(call.function.arguments);
    } catch {
      input = { _raw: call.function.arguments };
    }
    content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
  }

  const stopReason =
    choice.finish_reason === "tool_calls"
      ? "tool_use"
      : choice.finish_reason === "length"
        ? "max_tokens"
        : "end_turn";

  return {
    content,
    stopReason,
    usage: {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}
