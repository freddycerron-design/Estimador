/** Patrón detectado de forma determinista (sin LLM) sobre variance/feedback históricos (spec §18-19). */
export interface DetectedPattern {
  projectType: string;
  dimension: "effort" | "duration" | "cost";
  avgVariancePct: number; // positivo = subestimación sistemática, negativo = sobreestimación
  sampleSize: number;
  sourceLearningEventIds: string[];
}

/** Diff propuesto sobre una `estimation_rules` — nunca código ejecutable, solo parametrización. */
export interface EstimationRuleDiff {
  ruleName: string;
  ruleType: "effort_adjustment";
  projectType: string;
  multiplier: number; // ej. 1.20 = +20% de ajuste sobre el esfuerzo calculado
  basedOnPattern: DetectedPattern;
}

export interface EvaluationSummary {
  casesRun: number;
  casesImproved: number;
  baselineAvgErrorPct: number;
  adjustedAvgErrorPct: number;
  improvementPct: number;
  passed: boolean;
}
