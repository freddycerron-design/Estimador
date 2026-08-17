import * as XLSX from "xlsx";
import { db, unwrap } from "../../db/insforge-client.js";
import { loadReferenceLookup } from "../../config/reference-lookup.js";
import { createEmbeddingProvider } from "../../llm/provider-factory.js";

/**
 * Proceso de normalización para convertir formatos históricos externos (Excel/CSV) a
 * nuestro modelo común (spec §28) — sin tocar código para adaptarse a un archivo nuevo,
 * solo hace falta que respete las columnas del template (`GET /projects/import/template`).
 */
export interface ImportRow {
  name: string;
  description: string;
  project_type: string;
  industry: string;
  technologies: string;
  modules?: string;
  integrations?: string;
  team_size?: number;
  num_users?: number;
  num_interfaces?: number;
  complexity?: string;
  duration_weeks?: number;
  actual_cost?: number;
  total_hours?: number;
  effort_hours_json?: string;
  risks?: string;
  lessons_learned?: string;
}

export interface ImportRowResult {
  row: number;
  name: string;
  status: "imported" | "skipped";
  projectId?: string;
  error?: string;
}

export interface ImportSummary {
  totalRows: number;
  imported: number;
  skipped: number;
  results: ImportRowResult[];
  /** URL del archivo original respaldado en InsForge Storage (bucket "archivos"), si se pudo subir. */
  sourceFileUrl?: string | null;
}

const REQUIRED_COLUMNS = ["name", "description", "project_type"] as const;

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseSpreadsheet(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: undefined, raw: true });
}

export function buildImportTemplateBuffer(): Buffer {
  const example: ImportRow = {
    name: "Portal de Autoservicio de Clientes",
    description: "Portal web para que clientes consulten su estado de cuenta y generen solicitudes de soporte.",
    project_type: "internal_business_app",
    industry: "telecomunicaciones",
    technologies: "React;Node.js;PostgreSQL",
    modules: "Autoservicio;Solicitudes de soporte;Notificaciones",
    integrations: "CRM;SSO corporativo",
    team_size: 5,
    num_users: 300,
    num_interfaces: 3,
    complexity: "medium",
    duration_weeks: 14,
    actual_cost: 55000,
    total_hours: 1200,
    effort_hours_json: "",
    risks: "Disponibilidad del equipo de CRM para pruebas de integración",
    lessons_learned: "Confirmar acceso a ambientes de prueba antes de iniciar el desarrollo de la integración.",
  };
  const sheet = XLSX.utils.json_to_sheet([example]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "proyectos");
  return XLSX.write(workbook, { type: "buffer", bookType: "csv" }) as Buffer;
}

/**
 * Importa filas ya parseadas. Cada fila se procesa de forma independiente: un error en una
 * fila no aborta el resto (spec: cargar información histórica desde Excel/CSV/API/manual).
 */
export async function importRows(rows: ImportRow[]): Promise<ImportSummary> {
  const lookup = await loadReferenceLookup();
  const embedder = createEmbeddingProvider();
  const results: ImportRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2; // fila 1 = encabezados
    try {
      for (const col of REQUIRED_COLUMNS) {
        if (!row[col] || String(row[col]).trim() === "") {
          throw new Error(`Falta la columna requerida "${col}"`);
        }
      }

      const technologies = splitList(row.technologies);
      const modules = splitList(row.modules);
      const integrations = splitList(row.integrations);
      const risks = splitList(row.risks);

      const embeddingText = [row.name, row.description, `Tecnologías: ${technologies.join(", ")}`, `Módulos: ${modules.join(", ")}`].join("\n");
      const embedding = await embedder.embed(embeddingText);

      const [project] = await unwrap<{ id: string }[]>(
        "insert:projects:import",
        db
          .from("projects")
          .insert([
            {
              name: row.name,
              description: row.description,
              project_type: row.project_type,
              industry: row.industry ?? null,
              technologies,
              team_size: row.team_size ?? null,
              duration_weeks: row.duration_weeks ?? null,
              actual_cost: row.actual_cost ?? null,
              status: "completed",
              embedding,
              source: "imported",
            },
          ])
          .select("id")
      );
      if (!project) throw new Error("No se pudo insertar el proyecto");

      const featureRows = [
        modules.length > 0 && { project_id: project.id, category: "functional", feature_key: "modules", feature_value: modules, extracted_by: "manual", provenance: "FACTUAL" },
        row.num_users !== undefined && { project_id: project.id, category: "functional", feature_key: "num_users", feature_value: row.num_users, extracted_by: "manual", provenance: "FACTUAL" },
        { project_id: project.id, category: "technical", feature_key: "technologies", feature_value: technologies, extracted_by: "manual", provenance: "FACTUAL" },
        row.complexity && { project_id: project.id, category: "technical", feature_key: "complexity", feature_value: row.complexity, extracted_by: "manual", provenance: "FACTUAL" },
        integrations.length > 0 && { project_id: project.id, category: "integration", feature_key: "integrations", feature_value: integrations, extracted_by: "manual", provenance: "FACTUAL" },
        row.num_interfaces !== undefined && { project_id: project.id, category: "integration", feature_key: "num_interfaces", feature_value: row.num_interfaces, extracted_by: "manual", provenance: "FACTUAL" },
        risks.length > 0 && { project_id: project.id, category: "non_functional", feature_key: "risks", feature_value: risks, extracted_by: "manual", provenance: "FACTUAL" },
      ].filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (featureRows.length > 0) {
        await unwrap("insert:project_features:import", db.from("project_features").insert(featureRows).select());
      }

      // Esfuerzo real: si viene effort_hours_json (nombres de fase/rol) lo usamos tal cual;
      // si solo viene total_hours, se guarda como un único bucket "Desarrollo/Developer" —
      // más honesto que inventar una distribución por fase que nadie proporcionó.
      let actualEffortHours: Record<string, Record<string, number>> = {};
      if (row.effort_hours_json) {
        const byName = JSON.parse(row.effort_hours_json) as Record<string, Record<string, number>>;
        for (const [phaseName, roles] of Object.entries(byName)) {
          const phaseId = [...lookup.phasesById.values()].find((p) => p.name === phaseName)?.id;
          if (!phaseId) continue;
          const roleMap: Record<string, number> = {};
          for (const [roleName, hours] of Object.entries(roles)) {
            const roleId = [...lookup.rolesById.values()].find((r) => r.name === roleName)?.id;
            if (roleId) roleMap[roleId] = hours;
          }
          actualEffortHours[phaseId] = roleMap;
        }
      } else if (row.total_hours) {
        const devPhase = [...lookup.phasesById.values()].find((p) => p.name === "Desarrollo");
        const devRole = [...lookup.rolesById.values()].find((r) => r.name === "Developer");
        if (devPhase && devRole) actualEffortHours = { [devPhase.id]: { [devRole.id]: row.total_hours } };
      }

      if (Object.keys(actualEffortHours).length > 0) {
        await unwrap(
          "insert:project_actuals:import",
          db
            .from("project_actuals")
            .insert([
              {
                project_id: project.id,
                actual_effort_hours: actualEffortHours,
                actual_duration_weeks: row.duration_weeks ?? null,
                actual_cost: row.actual_cost ?? null,
                notes: row.effort_hours_json ? "Importado con desglose fase/rol." : "Importado sin desglose por fase/rol — horas totales bajo Desarrollo/Developer.",
              },
            ])
            .select()
        );
      }

      if (row.lessons_learned) {
        const lessonEmbedding = await embedder.embed(`${row.name}: ${row.lessons_learned}`);
        await unwrap(
          "insert:experiences:import",
          db
            .from("experiences")
            .insert([{ project_id: project.id, summary: row.description.slice(0, 200), lesson: row.lessons_learned, tags: [row.project_type, row.industry].filter(Boolean), embedding: lessonEmbedding }])
            .select()
        );
      }

      results.push({ row: rowNumber, name: row.name, status: "imported", projectId: project.id });
    } catch (err) {
      results.push({ row: rowNumber, name: row?.name ?? `fila ${rowNumber}`, status: "skipped", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    totalRows: rows.length,
    imported: results.filter((r) => r.status === "imported").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}
