/**
 * Taxonomía fija de "Tipo de proyecto" y "Categoría del proyecto" (antes "Industria") — spec
 * pedido por usuario: antes eran campos de texto libre (ej. project_type="internal_business_app"
 * en datos legado/sintéticos) y ahora se presentan como listbox en los formularios de
 * requerimiento y proyecto, y como valores de ejemplo en las plantillas de importación. Siguen
 * siendo columnas de texto libre en la base (sin CHECK/enum) — un valor legado que no calce con
 * esta lista simplemente no se preselecciona al editar, no se migra automáticamente.
 */
export const PROJECT_TYPE_OPTIONS = ["Implementación software", "Desarrollo software", "Data", "Infraestructura", "Seguridad", "Otros"] as const;
export type ProjectType = (typeof PROJECT_TYPE_OPTIONS)[number];

/** Antes "Industria" (spec pedido por usuario: renombrado a "Categoría del proyecto"). */
export const PROJECT_CATEGORY_OPTIONS = ["Académico", "Finanzas", "HR", "Backoffice", "Otros"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORY_OPTIONS)[number];
