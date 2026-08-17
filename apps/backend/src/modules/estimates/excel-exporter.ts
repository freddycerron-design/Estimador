import * as XLSX from "xlsx";
import type { EstimateExportData } from "./export-data.js";

const DIMENSION_LABELS: Record<string, string> = {
  functionality: "Funcionalidad",
  technology: "Tecnología",
  complexity: "Complejidad",
  integrations: "Integraciones",
  size: "Tamaño",
  scope: "Alcance",
  context: "Contexto",
};

/**
 * Versión inicial del export a Excel (a criterio propio, para refinar luego con una
 * plantilla — pedido explícito del usuario). Un libro con 4 hojas: Resumen, Esfuerzo,
 * Costos, Referencias — cubre lo mismo que el reporte markdown pero en formato tabular
 * editable, que es lo que normalmente se pide en este tipo de entregable.
 */
export function buildEstimateExcel(data: EstimateExportData): Buffer {
  const { estimate } = data;
  const workbook = XLSX.utils.book_new();

  const resumen = [
    ["Estimación", data.projectName],
    ["Descripción", data.projectDescription],
    [],
    ["", "Optimista", "Probable", "Pesimista"],
    ["Duración (semanas)", estimate.duration_weeks_optimistic, estimate.duration_weeks_probable, estimate.duration_weeks_pessimistic],
    ["Costo (" + estimate.currency + ")", estimate.cost_optimistic, estimate.cost_probable, estimate.cost_pessimistic],
    [],
    ["Confianza", estimate.confidence_score ? `${Math.round(Number(estimate.confidence_score) * 100)}%` : "—"],
    ["Umbral de similitud cumplido", estimate.similarity_threshold_met ? "Sí" : "No"],
    [],
    ["Riesgos"],
    ...(estimate.risks ?? []).map((r) => ["", r]),
    [],
    ["Recomendaciones"],
    ...(estimate.recommendations ?? []).map((r) => ["", r]),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  const esfuerzoHeader = ["Fase", "Rol", "Horas", "Procedencia"];
  const esfuerzoRows = data.lineItems.map((li) => [li.phaseName, li.roleName, li.hours, li.provenance]);
  const totalHours = data.lineItems.reduce((s, li) => s + li.hours, 0);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([esfuerzoHeader, ...esfuerzoRows, [], ["Total", "", totalHours, ""]]),
    "Esfuerzo por fase y rol"
  );

  const costosHeader = ["Rol", "Horas", "Tarifa/hora", "Costo"];
  const costosRows = data.costByRole.map((c) => [c.roleName, c.hours, c.ratePerHour, c.cost]);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      costosHeader,
      ...costosRows,
      [],
      ["Costo de mano de obra", "", "", data.laborCost],
      ["Total probable", "", "", Number(estimate.cost_probable)],
    ]),
    "Costos"
  );

  const refHeader = ["Proyecto de referencia", "Similitud", "Outlier", ...Object.values(DIMENSION_LABELS)];
  const dimKeys = Object.keys(DIMENSION_LABELS);
  const refRows = data.referenceProjects.map((r) => [
    r.projectName,
    `${Math.round(r.similarityScore * 100)}%`,
    r.isOutlier ? "Sí" : "No",
    ...dimKeys.map((k) => (r.dimensionScores[k] !== undefined ? `${Math.round(r.dimensionScores[k]! * 100)}%` : "—")),
  ]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([refHeader, ...refRows]), "Referencias históricas");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
