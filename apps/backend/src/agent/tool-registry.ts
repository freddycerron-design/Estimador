import type { LlmToolDefinition } from "../llm/types.js";
import type { SkillContext, SkillDefinition } from "../skills/types.js";
import { requirementAnalysisSkill } from "../skills/requirement-analysis/index.js";
import { projectSimilaritySkill } from "../skills/project-similarity/index.js";
import { estimationSkill } from "../skills/estimation/index.js";
import { costCalculationSkill } from "../skills/cost-calculation/index.js";
import { riskAnalysisSkill } from "../skills/risk-analysis/index.js";
import { projectComparisonSkill } from "../skills/project-comparison/index.js";
import { lessonsLearnedSkill } from "../skills/lessons-learned/index.js";
import { reportGenerationSkill } from "../skills/report-generation/index.js";

/**
 * Skills expuestas al agente conversacional como tools. `estimation-learning` queda fuera
 * deliberadamente — la usa solo el Learning Agent (proceso separado, spec §19).
 */
const CONVERSATIONAL_SKILLS: SkillDefinition<any, any>[] = [
  requirementAnalysisSkill,
  projectSimilaritySkill,
  estimationSkill,
  costCalculationSkill,
  riskAnalysisSkill,
  projectComparisonSkill,
  lessonsLearnedSkill,
  reportGenerationSkill,
];

const skillsByToolName = new Map(CONVERSATIONAL_SKILLS.map((s) => [s.toolName, s]));

export function toolDefinitions(): LlmToolDefinition[] {
  return CONVERSATIONAL_SKILLS.map((s) => ({
    name: s.toolName,
    description: s.description,
    inputSchema: s.inputSchema,
  }));
}

export async function dispatchTool(toolName: string, input: unknown, ctx: SkillContext): Promise<unknown> {
  const skill = skillsByToolName.get(toolName);
  if (!skill) throw new Error(`Tool desconocida: ${toolName}`);
  return skill.execute(input, ctx);
}

export function skillKeyForToolName(toolName: string): string | undefined {
  return skillsByToolName.get(toolName)?.key;
}
