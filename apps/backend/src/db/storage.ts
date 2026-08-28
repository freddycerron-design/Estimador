import { insforge } from "./insforge-client.js";

const IMPORTS_BUCKET = "archivos";
const ATTACHMENTS_BUCKET = "archivos";

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

/**
 * Sube el archivo adjunto original de un requerimiento a InsForge Storage, como respaldo/
 * auditoría (spec pedido por usuario: adjuntar archivos de detalle a un requerimiento) — el
 * texto ya extraído (`attachment-extraction.ts`) es lo que realmente se lee durante la
 * estimación, así que un fallo acá NUNCA debe bloquear la subida ni la lectura del contenido.
 */
export async function uploadRequirementAttachment(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  requirementId: string
): Promise<{ url: string | null; key: string }> {
  const key = `requirements/${requirementId}/${Date.now()}-${filename}`;
  try {
    const blob = new Blob([buffer], { type: mimeType });
    const { data, error } = await insforge.storage.from(ATTACHMENTS_BUCKET).upload(key, blob);
    if (error) {
      console.error("No se pudo subir el adjunto de requerimiento a InsForge Storage:", error);
      return { url: null, key };
    }
    return { url: data?.url ?? null, key };
  } catch (err) {
    console.error("Error subiendo adjunto de requerimiento:", err);
    return { url: null, key };
  }
}

export async function deleteRequirementAttachmentFile(key: string): Promise<void> {
  try {
    const { error } = await insforge.storage.from(ATTACHMENTS_BUCKET).remove(key);
    if (error) console.error("No se pudo eliminar el adjunto de InsForge Storage:", error);
  } catch (err) {
    console.error("Error eliminando adjunto de InsForge Storage:", err);
  }
}
