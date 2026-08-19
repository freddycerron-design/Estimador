/**
 * Registro liviano de los parámetros que cada Skill realmente lee de su `ctx.config`
 * (el jsonb de `skill_versions.definition`). Es solo metadata para que el panel de
 * admin explique qué se puede configurar y con qué default corre hoy — no valida ni
 * fuerza nada en runtime, eso lo sigue haciendo cada skill con `?? <default>` en su
 * propio `execute()`.
 *
 * Si una skill nueva empieza a leer `ctx.config.<algo>`, agregar su entrada acá para
 * que deje de verse como "sin parámetros configurados" en /admin.
 */
export interface SkillConfigParam {
  key: string;
  description: string;
  default: unknown;
}

export const SKILL_CONFIG_REGISTRY: Record<string, SkillConfigParam[]> = {
  "project-similarity": [
    {
      key: "candidateLimit",
      description: "Cantidad máxima de proyectos candidatos que trae la búsqueda semántica (match_projects) antes de puntuarlos.",
      default: 10,
    },
  ],
  "project-comparison": [
    {
      key: "userDeltaThresholdPct",
      description:
        "Diferencia mínima (%) en cantidad de usuarios entre el requerimiento y el proyecto de referencia para mencionarla como una diferencia relevante.",
      default: 15,
    },
  ],
};
