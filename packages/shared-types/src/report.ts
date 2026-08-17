import type { RequirementFeatures } from "./requirement.js";
import type { SimilarityResult } from "./similarity.js";
import type { EstimationOutput, CostBreakdown } from "./estimation.js";

/** Todo lo que un template de reporte necesita para renderizar el resultado final (spec §29-30). */
export interface EstimationBundle {
  requirement: RequirementFeatures;
  similarity: SimilarityResult;
  referenceProjectNames: Record<string, string>; // projectId -> name, para mostrar en el reporte
  estimation: EstimationOutput;
  cost: CostBreakdown;
  risks: string[];
  recommendations: string[];
}

export const REPORT_TEMPLATES = ["executive", "detailed"] as const;
export type ReportTemplate = (typeof REPORT_TEMPLATES)[number];

export interface Report {
  template: ReportTemplate;
  markdown: string;
}
