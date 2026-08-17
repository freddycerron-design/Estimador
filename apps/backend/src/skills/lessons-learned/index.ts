import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { rpc } from "../../db/insforge-client.js";
import type { MatchExperiencesRow } from "../../db/types.js";
import { defineSkill } from "../types.js";

const InputSchema = z.object({
  queryText: z.string().min(1),
  limit: z.number().int().positive().max(20).default(5),
});

export interface LessonsLearnedOutput {
  experiences: { summary: string; lesson: string; similarity: number }[];
}

export const lessonsLearnedSkill = defineSkill<{ queryText: string; limit?: number }, LessonsLearnedOutput>({
  key: "lessons-learned",
  toolName: "recall_lessons_learned",
  description: "Recupera lecciones aprendidas de proyectos y experiencias pasadas semánticamente relevantes al requerimiento actual.",
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(input, ctx) {
    const parsed = InputSchema.parse(input);
    const embedding = await ctx.embed(parsed.queryText);
    const rows = await rpc<MatchExperiencesRow[]>("match_experiences", {
      query_embedding: embedding,
      match_count: parsed.limit,
    });
    return { experiences: rows.map((r) => ({ summary: r.summary, lesson: r.lesson, similarity: r.similarity })) };
  },
});
