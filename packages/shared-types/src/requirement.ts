/** Salida estructurada de la Skill `requirement-analysis` (spec §2). */
export interface RequirementFeatures {
  projectType: string | null;
  industry: string | null;
  technologies: string[];
  modules: string[];
  integrations: string[];
  numUsers: number | null;
  numInterfaces: number | null;
  complexity: "low" | "medium" | "high" | "very_high" | null;
  /** Descripción libre del requerimiento, tal como la dio el usuario (o fusionada tras iteraciones). */
  description: string;
  /** Campos que el análisis no pudo determinar y que podrían mejorar la estimación si se conocen. */
  missingInformation: string[];
}
