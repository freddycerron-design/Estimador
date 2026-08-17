import type { Provenance } from "./provenance.js";

export interface EstimateLineItem {
  phaseId: string;
  phaseName: string;
  roleId: string;
  roleName: string;
  hours: number;
  provenance: Provenance;
  sourceNote?: string;
}

export interface EffortRange {
  optimistic: number;
  probable: number;
  pessimistic: number;
}

export interface ConfidenceFactors {
  similarityAvg: number;
  sampleSize: number;
  dispersion: number; // coeficiente de variación de horas totales entre referencias
  infoCompleteness: number; // 0..1, según campos faltantes del requerimiento
}

export interface EstimationOutput {
  lineItems: EstimateLineItem[];
  effortHoursRange: EffortRange;
  durationWeeksRange: EffortRange;
  confidenceScore: number; // 0..1
  confidenceFactors: ConfidenceFactors;
  assumptions: string[];
}

export interface CostLine {
  roleId: string;
  roleName: string;
  hours: number;
  ratePerHour: number;
  cost: number;
}

export interface CostBreakdown {
  currency: string;
  byRole: CostLine[];
  laborCost: number;
  overheadPct: number;
  contingencyPct: number;
  overheadCost: number;
  contingencyCost: number;
  totalCost: EffortRange;
}
