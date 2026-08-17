import type { EstimationBundle, ReportTemplate } from "@estimador/shared-types";
import { renderExecutive } from "./executive.js";
import { renderDetailed } from "./detailed.js";

/** Registro extensible de plantillas de salida (spec §29) — agregar una nueva plantilla es agregar una entrada acá. */
export const TEMPLATE_REGISTRY: Record<ReportTemplate, (bundle: EstimationBundle) => string> = {
  executive: renderExecutive,
  detailed: renderDetailed,
};
