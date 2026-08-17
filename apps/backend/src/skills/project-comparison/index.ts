import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { RequirementFeatures } from "@estimador/shared-types";
import { db, unwrap } from "../../db/insforge-client.js";
import type { ProjectRow, ProjectFeatureRow } from "../../db/types.js";
import { defineSkill } from "../types.js";

const InputSchema = z.object({
  projectId: z.string().uuid(),
  requirement: z.object({
    numUsers: z.number().nullable(),
    numInterfaces: z.number().nullable(),
    technologies: z.array(z.string()),
    modules: z.array(z.string()),
    integrations: z.array(z.string()),
  }),
});

export interface ProjectComparisonOutput {
  differences: string[];
}

/** Explica en lenguaje natural las diferencias entre el requerimiento actual y un proyecto de referencia (spec §10). */
export const projectComparisonSkill = defineSkill<
  { projectId: string; requirement: Pick<RequirementFeatures, "numUsers" | "numInterfaces" | "technologies" | "modules" | "integrations"> },
  ProjectComparisonOutput
>({
  key: "project-comparison",
  toolName: "compare_to_reference_project",
  description: "Explica las diferencias principales entre el requerimiento actual y un proyecto histórico de referencia.",
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(input) {
    const { projectId, requirement } = InputSchema.parse(input);
    const [project] = await unwrap<ProjectRow[]>("select:projects:one", db.from("projects").select().eq("id", projectId));
    const features = await unwrap<ProjectFeatureRow[]>("select:project_features:one", db.from("project_features").select().eq("project_id", projectId));
    if (!project) return { differences: [] };

    const feature = <T,>(key: string, fallback: T): T => (features.find((f) => f.feature_key === key)?.feature_value as T) ?? fallback;
    const candNumUsers = feature<number | null>("num_users", null);
    const candNumInterfaces = feature<number | null>("num_interfaces", null);
    const candModules = feature<string[]>("modules", []);
    const candIntegrations = feature<string[]>("integrations", []);

    const differences: string[] = [];

    if (requirement.numUsers !== null && candNumUsers !== null && candNumUsers > 0) {
      const deltaPct = Math.round(((requirement.numUsers - candNumUsers) / candNumUsers) * 100);
      if (Math.abs(deltaPct) >= 15) {
        differences.push(`El nuevo proyecto tiene ${deltaPct > 0 ? `${deltaPct}% más` : `${Math.abs(deltaPct)}% menos`} usuarios que ${project.name}.`);
      }
    }
    if (requirement.integrations.length !== candIntegrations.length) {
      const delta = requirement.integrations.length - candIntegrations.length;
      differences.push(`El nuevo proyecto tiene ${Math.abs(delta)} integraci${Math.abs(delta) === 1 ? "ón" : "ones"} ${delta > 0 ? "adicional(es)" : "menos"} respecto a ${project.name}.`);
    }
    const newModules = requirement.modules.filter((m) => !candModules.some((cm) => cm.toLowerCase() === m.toLowerCase()));
    if (newModules.length > 0) {
      differences.push(`Requiere funcionalidad que no existía en ${project.name}: ${newModules.join(", ")}.`);
    }
    const newTech = requirement.technologies.filter((t) => !project.technologies.some((pt) => pt.toLowerCase() === t.toLowerCase()));
    if (newTech.length > 0) {
      differences.push(`Usa tecnología distinta a la de ${project.name}: ${newTech.join(", ")}.`);
    }

    return { differences };
  },
});
