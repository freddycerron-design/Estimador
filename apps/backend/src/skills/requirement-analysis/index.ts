import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { RequirementFeatures } from "@estimador/shared-types";
import { defineSkill } from "../types.js";
import type { LlmToolDefinition } from "../../llm/types.js";

const InputSchema = z.object({
  rawText: z.string().min(1),
  /** Features ya conocidas de turnos previos de la conversación (spec §9: proceso iterativo). */
  priorFeatures: z
    .object({
      projectType: z.string().nullable().optional(),
      industry: z.string().nullable().optional(),
      technologies: z.array(z.string()).optional(),
      modules: z.array(z.string()).optional(),
      integrations: z.array(z.string()).optional(),
      numUsers: z.number().nullable().optional(),
      numInterfaces: z.number().nullable().optional(),
      complexity: z.enum(["low", "medium", "high", "very_high"]).nullable().optional(),
    })
    .optional(),
});

const ExtractionSchema = z.object({
  projectType: z.string().nullable(),
  industry: z.string().nullable(),
  technologies: z.array(z.string()),
  modules: z.array(z.string()),
  integrations: z.array(z.string()),
  numUsers: z.number().nullable(),
  numInterfaces: z.number().nullable(),
  complexity: z.enum(["low", "medium", "high", "very_high"]).nullable(),
  missingInformation: z.array(z.string()),
});

const EXTRACT_TOOL_NAME = "extract_requirement_features";
const extractTool: LlmToolDefinition = {
  name: EXTRACT_TOOL_NAME,
  description: "Devuelve las características estructuradas extraídas del requerimiento.",
  inputSchema: zodToJsonSchema(ExtractionSchema) as any,
};

const SYSTEM_PROMPT = `Eres un analista experto en requerimientos de proyectos de TI. Analiza el texto del usuario (y las características ya conocidas de turnos anteriores, si existen) y extrae:
- projectType: tipo de proyecto (ej. "internal_business_app", "mobile_app", "ecommerce", "integration", "data_platform", "legacy_modernization", etc.) o null si no es determinable.
- industry: industria del cliente/negocio, o null.
- technologies: tecnologías mencionadas o claramente implícitas (lista vacía si ninguna).
- modules: módulos o funcionalidades principales mencionadas.
- integrations: integraciones con otros sistemas mencionadas.
- numUsers: número aproximado de usuarios, o null si no se menciona.
- numInterfaces: número de interfaces/pantallas o sistemas externos, o null si no se menciona.
- complexity: "low"|"medium"|"high"|"very_high" si es inferible razonablemente, o null.
- missingInformation: lista de preguntas cortas y específicas sobre información que falta y que sería relevante para estimar (NO preguntes lo que ya se puede inferir razonablemente).

No inventes información que no está en el texto ni es una inferencia razonable — usa null/listas vacías y regístralo en missingInformation en su lugar. Llama SIEMPRE a la tool "${EXTRACT_TOOL_NAME}" con el resultado.`;

export const requirementAnalysisSkill = defineSkill<
  { rawText: string; priorFeatures?: Partial<RequirementFeatures> },
  RequirementFeatures
>({
  key: "requirement-analysis",
  toolName: "analyze_requirement",
  description:
    "Analiza el requerimiento del usuario (texto libre) y extrae tipo de proyecto, tecnologías, módulos, integraciones, tamaño y complejidad, señalando qué información relevante falta.",
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(input, ctx) {
    const parsed = InputSchema.parse(input);
    const priorContext = parsed.priorFeatures
      ? `\n\nCaracterísticas ya conocidas de turnos anteriores (a complementar, no descartar):\n${JSON.stringify(parsed.priorFeatures, null, 2)}`
      : "";

    const response = await ctx.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: parsed.rawText + priorContext }] }],
      tools: [extractTool],
      toolChoice: { type: "tool", toolName: EXTRACT_TOOL_NAME },
      maxTokens: 1500,
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("requirement-analysis: el modelo no devolvió la extracción estructurada esperada");
    }

    const extracted = ExtractionSchema.parse(toolUse.input);
    return { ...extracted, description: parsed.rawText };
  },
});
