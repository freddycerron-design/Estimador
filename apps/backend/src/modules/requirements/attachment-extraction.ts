import * as XLSX from "xlsx";
// Ver src/types/pdf-parse-lib.d.ts: se importa la implementación directa, no el entrypoint del
// paquete, para evitar un bug conocido de pdf-parse@1.1.1 bajo ESM (ENOENT en su self-test).
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

export type ExtractionStatus = "ok" | "unsupported" | "error";

export interface ExtractionResult {
  text: string | null;
  status: ExtractionStatus;
  note: string | null;
}

/** Tope de caracteres extraídos por archivo — un documento de detalle no necesita más para dar
 * contexto, y evita que un PDF de cientos de páginas infle el mensaje enviado al agente. */
const MAX_EXTRACTED_CHARS = 15000;

function truncate(text: string): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_EXTRACTED_CHARS) return { text: trimmed, truncated: false };
  return { text: trimmed.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
}

function truncationNote(truncated: boolean): string | null {
  return truncated ? `Texto truncado a los primeros ${MAX_EXTRACTED_CHARS} caracteres.` : null;
}

/**
 * Extrae texto plano de un archivo adjunto a un requerimiento (spec pedido por usuario: los
 * archivos "deben ser leídos durante la estimación", no solo quedar guardados) — soporta los
 * formatos más comunes para documentos de detalle. Nunca lanza: un formato no soportado o un
 * archivo corrupto se marca explícitamente en el resultado en vez de romper la subida.
 */
export async function extractAttachmentText(buffer: Buffer, filename: string, mimeType: string): Promise<ExtractionResult> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  try {
    if (ext === "pdf" || mimeType === "application/pdf") {
      const data = await pdfParse(buffer);
      const { text, truncated } = truncate(data.text ?? "");
      if (!text) return { text: null, status: "error", note: "No se pudo extraer texto del PDF (¿es un PDF escaneado sin texto seleccionable?)." };
      return { text, status: "ok", note: truncationNote(truncated) };
    }

    if (ext === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const { value } = await mammoth.extractRawText({ buffer });
      const { text, truncated } = truncate(value ?? "");
      if (!text) return { text: null, status: "error", note: "No se pudo extraer texto del documento Word." };
      return { text, status: "ok", note: truncationNote(truncated) };
    }

    if (ext === "xlsx" || ext === "xls" || mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const parts = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        return sheet ? `--- Hoja: ${name} ---\n${XLSX.utils.sheet_to_csv(sheet)}` : "";
      }).filter(Boolean);
      const { text, truncated } = truncate(parts.join("\n\n"));
      if (!text) return { text: null, status: "error", note: "El archivo de Excel no tiene datos." };
      return { text, status: "ok", note: truncationNote(truncated) };
    }

    if (ext === "txt" || ext === "md" || ext === "csv" || mimeType.startsWith("text/")) {
      const { text, truncated } = truncate(buffer.toString("utf-8"));
      if (!text) return { text: null, status: "error", note: "El archivo de texto está vacío." };
      return { text, status: "ok", note: truncationNote(truncated) };
    }

    return {
      text: null,
      status: "unsupported",
      note: `Formato "${ext || mimeType}" no soportado para lectura automática — formatos soportados: PDF, Word (.docx), Excel (.xlsx/.xls) y texto plano (.txt/.md/.csv). El archivo queda guardado como respaldo pero no se incluirá en el contexto de la estimación.`,
    };
  } catch (err) {
    return { text: null, status: "error", note: `Error al leer el archivo: ${err instanceof Error ? err.message : String(err)}` };
  }
}
