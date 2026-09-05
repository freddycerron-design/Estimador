/**
 * Espejo manual de `@estimador/shared-types` (mismo criterio que `estimation-parameters.ts`: el
 * frontend no depende de ese paquete, los contratos se replican como TS plano acá). Taxonomía
 * fija de "Tipo de proyecto" y "Categoría del proyecto" (antes "Industria") para los listbox de
 * los formularios de requerimiento y de proyecto (spec pedido por usuario).
 */
export const PROJECT_TYPE_OPTIONS = ["Implementación software", "Desarrollo software", "Data", "Infraestructura", "Seguridad", "Otros"] as const;
export type ProjectType = (typeof PROJECT_TYPE_OPTIONS)[number];

/** Antes "Industria". */
export const PROJECT_CATEGORY_OPTIONS = ["Académico", "Finanzas", "HR", "Backoffice", "Otros"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORY_OPTIONS)[number];
