import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { REPORT_TEMPLATES, type EstimationBundle, type Report } from "@estimador/shared-types";
import { defineSkill } from "../types.js";
import { TEMPLATE_REGISTRY } from "./templates/template-registry.js";

const InputSchema = z.object({
  template: z.enum(REPORT_TEMPLATES).default("detailed"),
  bundle: z.any(), // EstimationBundle — validado estructuralmente por los templates al leer sus campos
});

export const reportGenerationSkill = defineSkill<{ template?: string; bundle: EstimationBundle }, Report>({
  key: "report-generation",
  toolName: "generate_report",
  description: `Genera el resultado final de la estimación en la plantilla seleccionada (${REPORT_TEMPLATES.join(", ")}).`,
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(input) {
    const template = (input.template as (typeof REPORT_TEMPLATES)[number] | undefined) ?? "detailed";
    const renderer = TEMPLATE_REGISTRY[template];
    if (!renderer) throw new Error(`Plantilla desconocida: ${template}`);
    return { template, markdown: renderer(input.bundle) };
  },
});
