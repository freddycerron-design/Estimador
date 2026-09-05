import * as XLSX from "xlsx";
import { db, unwrap } from "../../db/insforge-client.js";
import { PROJECT_TYPE_OPTIONS, PROJECT_CATEGORY_OPTIONS } from "@estimador/shared-types";

export interface RequirementImportRow {
  title: string;
  description: string;
  project_type?: string;
  industry?: string;
  technologies?: string;
  modules?: string;
  integrations?: string;
  num_users?: number;
  num_interfaces?: number;
  complexity?: string;
}

export interface RequirementImportResult {
  row: number;
  title: string;
  status: "imported" | "skipped";
  requirementId?: string;
  error?: string;
}

export interface RequirementImportSummary {
  totalRows: number;
  imported: number;
  skipped: number;
  results: RequirementImportResult[];
}

const REQUIRED_COLUMNS = ["title", "description"] as const;

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseRequirementsSpreadsheet(buffer: Buffer): RequirementImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<RequirementImportRow>(sheet, { defval: undefined, raw: true });
}

export function buildRequirementsImportTemplateBuffer(): Buffer {
  const example: RequirementImportRow = {
    title: "Portal de solicitudes de compra",
    description: "Aplicación web para gestionar solicitudes de compra internas, integrada con el ERP SAP, con 5 tipos de usuario.",
    project_type: PROJECT_TYPE_OPTIONS[0],
    industry: PROJECT_CATEGORY_OPTIONS[3],
    technologies: "React;Node.js;PostgreSQL",
    modules: "Solicitudes;Aprobaciones;Reportes",
    integrations: "SAP ERP;SSO corporativo",
    num_users: 150,
    num_interfaces: 3,
    complexity: "medium",
  };
  const sheet = XLSX.utils.json_to_sheet([example]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "requerimientos");
  return XLSX.write(workbook, { type: "buffer", bookType: "csv" }) as Buffer;
}

export async function importRequirementRows(rows: RequirementImportRow[], createdBy: string): Promise<RequirementImportSummary> {
  const results: RequirementImportResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2;
    try {
      for (const col of REQUIRED_COLUMNS) {
        if (!row[col] || String(row[col]).trim() === "") throw new Error(`Falta la columna requerida "${col}"`);
      }
      const [requirement] = await unwrap<{ id: string }[]>(
        "insert:requirements:import",
        db
          .from("requirements")
          .insert([
            {
              title: row.title,
              description: row.description,
              project_type: row.project_type ?? null,
              industry: row.industry ?? null,
              technologies: splitList(row.technologies),
              modules: splitList(row.modules),
              integrations: splitList(row.integrations),
              num_users: row.num_users ?? null,
              num_interfaces: row.num_interfaces ?? null,
              complexity: row.complexity ?? null,
              status: "new",
              created_by: createdBy,
            },
          ])
          .select("id")
      );
      if (!requirement) throw new Error("No se pudo insertar el requerimiento");
      results.push({ row: rowNumber, title: row.title, status: "imported", requirementId: requirement.id });
    } catch (err) {
      results.push({ row: rowNumber, title: row?.title ?? `fila ${rowNumber}`, status: "skipped", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    totalRows: rows.length,
    imported: results.filter((r) => r.status === "imported").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}
