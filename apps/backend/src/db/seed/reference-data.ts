/** Fases y roles configurables (spec §12, §13) — datos base insertados por el seed. */

export const PHASES: { name: string; sortOrder: number }[] = [
  { name: "Análisis", sortOrder: 1 },
  { name: "Diseño", sortOrder: 2 },
  { name: "Arquitectura", sortOrder: 3 },
  { name: "Desarrollo", sortOrder: 4 },
  { name: "Integración", sortOrder: 5 },
  { name: "Pruebas", sortOrder: 6 },
  { name: "QA", sortOrder: 7 },
  { name: "Seguridad", sortOrder: 8 },
  { name: "Despliegue", sortOrder: 9 },
  { name: "Gestión de Proyecto", sortOrder: 10 },
  { name: "Capacitación", sortOrder: 11 },
  { name: "Soporte/Hypercare", sortOrder: 12 },
];

export const ROLES: { name: string; category: string }[] = [
  { name: "Project Manager", category: "management" },
  { name: "Business Analyst", category: "analysis" },
  { name: "Solution Architect", category: "architecture" },
  { name: "Developer", category: "engineering" },
  { name: "QA", category: "quality" },
  { name: "DevOps", category: "operations" },
  { name: "Security", category: "security" },
  { name: "UX/UI", category: "design" },
  { name: "Data Engineer", category: "engineering" },
];

/** Tarifas de ejemplo, USD/hora (spec §14) — configurables, no hardcodeadas en lógica de negocio. */
export const COST_RATES: Record<string, number> = {
  "Project Manager": 55,
  "Business Analyst": 45,
  "Solution Architect": 60,
  Developer: 35,
  QA: 25,
  DevOps: 45,
  Security: 55,
  "UX/UI": 40,
  "Data Engineer": 50,
};

/** Pesos de similitud por defecto (spec §6) — deben sumar 1.0. */
export const DEFAULT_SIMILARITY_WEIGHTS = {
  functionality: 0.25,
  technology: 0.2,
  complexity: 0.15,
  integrations: 0.15,
  size: 0.1,
  scope: 0.1,
  context: 0.05,
};

export const DEFAULT_SYSTEM_SETTINGS: Record<string, unknown> = {
  MIN_SIMILARITY_THRESHOLD: 0.75,
  MAX_ADAPTIVE_ITERATIONS: 5,
  DEFAULT_CONTINGENCY_PCT: 0.15,
  DEFAULT_OVERHEAD_PCT: 0.1,
  OUTLIER_ZSCORE_THRESHOLD: 2.5,
  // Learning Agent (spec §18-25): una sola experiencia nunca se convierte en regla.
  MIN_SAMPLE_SIZE_FOR_PATTERN: 3,
  PATTERN_VARIANCE_THRESHOLD_PCT: 12,
  PROPOSAL_IMPROVEMENT_THRESHOLD_PCT: 5,
};

export const SKILLS_CATALOG: { key: string; displayName: string; description: string }[] = [
  { key: "requirement-analysis", displayName: "Análisis de Requerimiento", description: "Extrae tipo de proyecto, capacidades tecnológicas, componentes funcionales, integraciones e información faltante de un requerimiento en lenguaje natural." },
  { key: "project-similarity", displayName: "Similitud de Proyectos", description: "Busca proyectos históricos similares (semántica + atributos estructurados) y calcula % de similitud multi-dimensional." },
  { key: "estimation", displayName: "Estimación", description: "Calcula esfuerzo, duración, rango y confianza a partir de proyectos de referencia ponderados por similitud." },
  { key: "cost-calculation", displayName: "Cálculo de Costos", description: "Calcula costo por rol/fase usando tarifas configurables, overhead, contingencia e impuestos." },
  { key: "risk-analysis", displayName: "Análisis de Riesgos", description: "Identifica riesgos principales del proyecto en base a sus características y a riesgos históricos similares." },
  { key: "project-comparison", displayName: "Comparación de Proyectos", description: "Compara el proyecto actual contra sus referencias históricas, explicando diferencias." },
  { key: "lessons-learned", displayName: "Lecciones Aprendidas", description: "Recupera lecciones aprendidas relevantes de proyectos y experiencias pasadas." },
  { key: "estimation-learning", displayName: "Aprendizaje de Estimación", description: "Analiza desviaciones estimación-vs-real y feedback para proponer ajustes a reglas/Skills (usada por el Learning Agent, no expuesta al agente conversacional)." },
  { key: "report-generation", displayName: "Generación de Reportes", description: "Genera el resultado final de la estimación según la plantilla de salida seleccionada." },
];
