import { insforge } from "./insforge-client.js";

const IMPORTS_BUCKET = "archivos";

/**
 * Sube el archivo Excel/CSV original al bucket de InsForge como respaldo/auditoría de la
 * importación (spec §28: cargar información histórica desde Excel/CSV) — no es necesario
 * para que la importación funcione (los datos ya se parsean e insertan directo), pero deja
 * trazabilidad de desde qué archivo se cargó cada tanda de proyectos.
 */
export async function uploadImportFile(buffer: Buffer, filename: string, mimeType: string): Promise<string | null> {
  try {
    const blob = new Blob([buffer], { type: mimeType });
    const key = `imports/${Date.now()}-${filename}`;
    const { data, error } = await insforge.storage.from(IMPORTS_BUCKET).upload(key, blob);
    if (error) {
      console.error("No se pudo subir el archivo de importación a InsForge Storage:", error);
      return null;
    }
    return data?.url ?? null;
  } catch (err) {
    // El respaldo del archivo es "nice to have" — un fallo acá NUNCA debe abortar la importación.
    console.error("Error subiendo archivo de importación:", err);
    return null;
  }
}
