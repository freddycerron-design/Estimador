import { db, unwrap, unwrapNullable } from "../../db/insforge-client.js";
import type { ProjectEstimateRow, EstimateLineItemRow, ReferenceProjectRow, ProjectRow } from "../../db/types.js";
import { loadReferenceLookup } from "../../config/reference-lookup.js";
import { loadActiveCostRates } from "../../config/cost-rates.js";

export interface ExportLineItem {
  phaseName: string;
  roleName: string;
  hours: number;
  provenance: string;
}

export interface ExportReference {
  projectName: string;
  similarityScore: number;
  isOutlier: boolean;
  dimensionScores: Record<string, number>;
}

export interface ExportCostLine {
  roleName: string;
  hours: number;
  ratePerHour: number;
  cost: number;
}

export interface EstimateExportData {
  estimate: ProjectEstimateRow;
  projectName: string;
  projectDescription: string;
  lineItems: ExportLineItem[];
  referenceProjects: ExportReference[];
  costByRole: ExportCostLine[];
  laborCost: number;
}

/** Reúne todo lo necesario para exportar una estimación persistida a Excel/PPTX, fielmente. */
export async function loadEstimateExportData(estimateId: string): Promise<EstimateExportData | null> {
  const estimate = await unwrapNullable<ProjectEstimateRow | null>(
    "select:project_estimates:export",
    db.from("project_estimates").select().eq("id", estimateId).maybeSingle()
  );
  if (!estimate) return null;

  const [lineItemRows, referenceRows, lookup, costRates] = await Promise.all([
    unwrap<EstimateLineItemRow[]>("select:estimate_line_items:export", db.from("estimate_line_items").select().eq("estimate_id", estimateId)),
    unwrap<ReferenceProjectRow[]>("select:reference_projects:export", db.from("reference_projects").select().eq("estimate_id", estimateId)),
    loadReferenceLookup(),
    loadActiveCostRates(),
  ]);

  const project = estimate.project_id
    ? await unwrapNullable<ProjectRow | null>("select:projects:export", db.from("projects").select().eq("id", estimate.project_id).maybeSingle())
    : null;

  const refProjectIds = referenceRows.map((r) => r.reference_project_id);
  const refProjects =
    refProjectIds.length > 0
      ? await unwrap<{ id: string; name: string }[]>("select:projects:export_refs", db.from("projects").select("id, name").in("id", refProjectIds))
      : [];
  const refNameById = new Map(refProjects.map((p) => [p.id, p.name]));

  // Mismo orden que en pantalla (spec pedido por usuario): agrupado por fase según
  // `phases.sort_order`, y dentro de cada fase de mayor a menor esfuerzo.
  const lineItems: ExportLineItem[] = lineItemRows
    .map((li) => ({
      phaseName: lookup.phasesById.get(li.phase_id)?.name ?? li.phase_id,
      phaseSortOrder: lookup.phasesById.get(li.phase_id)?.sort_order ?? 999,
      roleName: lookup.rolesById.get(li.role_id)?.name ?? li.role_id,
      hours: Number(li.hours),
      provenance: li.provenance,
    }))
    .sort((a, b) => a.phaseSortOrder - b.phaseSortOrder || b.hours - a.hours)
    .map(({ phaseSortOrder: _phaseSortOrder, ...rest }) => rest);

  const hoursByRole = new Map<string, number>();
  for (const li of lineItems) hoursByRole.set(li.roleName, (hoursByRole.get(li.roleName) ?? 0) + li.hours);

  const rateByRoleName = new Map<string, number>();
  for (const [roleId, rate] of costRates) {
    const roleName = lookup.rolesById.get(roleId)?.name;
    if (roleName) rateByRoleName.set(roleName, Number(rate.rate_per_hour));
  }

  const costByRole: ExportCostLine[] = [...hoursByRole.entries()]
    .map(([roleName, hours]) => {
      const ratePerHour = rateByRoleName.get(roleName) ?? 40;
      return { roleName, hours, ratePerHour, cost: Math.round(hours * ratePerHour) };
    })
    .sort((a, b) => b.cost - a.cost);
  const laborCost = costByRole.reduce((sum, c) => sum + c.cost, 0);

  return {
    estimate,
    projectName: project?.name ?? "Estimación",
    projectDescription: project?.description ?? "",
    lineItems,
    referenceProjects: referenceRows.map((r) => ({
      projectName: refNameById.get(r.reference_project_id) ?? r.reference_project_id,
      similarityScore: Number(r.similarity_score),
      isOutlier: r.is_outlier,
      dimensionScores: r.similarity_breakdown,
    })),
    costByRole,
    laborCost,
  };
}
