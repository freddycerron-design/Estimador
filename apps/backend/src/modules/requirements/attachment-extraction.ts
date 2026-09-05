import * as XLSX from "xlsx";
// Ver src/types/pdf-parse-lib.d.ts: se importa la implementación directa, no el entrypoint del
// paquete, para evitar un bug conocido de pdf-parse@1.1.1 bajo ESM (ENOENT en su self-test).
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import JSZip from "jszip";

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

function decodeXmlEntities(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/**
 * Firma de OLE2/Compound File Binary Format (D0 CF 11 E0 A1 B1 1A E1). La usan tanto los
 * formatos binarios antiguos de Office (.doc/.xls/.ppt) como los .docx/.xlsx/.pptx MODERNOS
 * protegidos con contraseña — Office los envuelve en este contenedor cifrado en vez de guardarlos
 * como zip plano (que es lo que .docx/.xlsx/.pptx son por dentro cuando NO tienen contraseña).
 *
 * Detectarla ANTES de intentar parsear un .docx/.pptx/.xlsx como zip evita el error genérico y
 * confuso de la librería subyacente (ej. JSZip: "Can't find end of central directory: is this a
 * zip file?") — un archivo así realmente no es un zip por fuera, pero el motivo (protegido con
 * contraseña, o formato antiguo mal renombrado) es información accionable que el mensaje
 * genérico no da (reportado por el usuario: el error "lo identifica como un zip", cuando el
 * verdadero problema es que NO lo es).
 */
const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function looksLikeOle2Container(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE2_SIGNATURE);
}

const OLE2_NOTE =
  'Este archivo no se pudo leer: por dentro no es un Office moderno (el formato que su extensión promete), sino el contenedor antiguo de Office (OLE2) — típico de un archivo protegido con contraseña, o guardado en el formato binario previo a 2007 aunque lleve una extensión moderna. Quita la contraseña o reexporta el archivo sin protección (sin cambiarle el formato) y vuelve a subirlo.';

/**
 * .pptx es un zip con una entrada XML por diapositiva (`ppt/slides/slideN.xml`) — se extrae el
 * texto de cada `<a:t>` (los cuadros de texto de PowerPoint) sin depender de una librería de
 * parseo de Office completa. El .ppt binario antiguo (pre-2007) no usa este formato y se marca
 * aparte como no soportado, con una nota específica en vez de la genérica.
 */
async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0));

  const slides: string[] = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name]!.async("text");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1] ?? ""));
    if (texts.length > 0) slides.push(texts.join(" "));
  }
  return slides.map((s, i) => `--- Diapositiva ${i + 1} ---\n${s}`).join("\n\n");
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
      if (looksLikeOle2Container(buffer)) return { text: null, status: "unsupported", note: OLE2_NOTE };
      const { value } = await mammoth.extractRawText({ buffer });
      const { text, truncated } = truncate(value ?? "");
      if (!text) return { text: null, status: "error", note: "No se pudo extraer texto del documento Word." };
      return { text, status: "ok", note: truncationNote(truncated) };
    }

    if (ext === "pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
      if (looksLikeOle2Container(buffer)) return { text: null, status: "unsupported", note: OLE2_NOTE };
      const raw = await extractPptxText(buffer);
      const { text, truncated } = truncate(raw);
      if (!text) return { text: null, status: "error", note: "No se pudo extraer texto de la presentación (¿las diapositivas tienen solo imágenes, sin cuadros de texto?)." };
      return { text, status: "ok", note: truncationNote(truncated) };
    }

    if (ext === "ppt" || mimeType === "application/vnd.ms-powerpoint") {
      return {
        text: null,
        status: "unsupported",
        note: 'Solo se soporta PowerPoint moderno (.pptx) — el formato antiguo .ppt no se puede leer automáticamente. Reexporta el archivo como .pptx ("Guardar como") y vuelve a subirlo.',
      };
    }

    if (ext === "xlsx" || ext === "xls" || mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      // Ojo: a diferencia de docx/pptx, un .xls (extensión antigua) SIEMPRE es OLE2 — es su
      // formato normal, y SheetJS lo lee sin problema. Solo es anómalo cuando la extensión
      // promete el formato moderno (.xlsx) pero el contenido es OLE2 (protegido con contraseña,
      // o un .xls legado renombrado a .xlsx).
      if (ext === "xlsx" && looksLikeOle2Container(buffer)) return { text: null, status: "unsupported", note: OLE2_NOTE };
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
      note: `Formato "${ext || mimeType}" no soportado para lectura automática — formatos soportados: PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx/.xls) y texto plano (.txt/.md/.csv). El archivo queda guardado como respaldo pero no se incluirá en el contexto de la estimación.`,
    };
  } catch (err) {
    return { text: null, status: "error", note: `Error al leer el archivo: ${err instanceof Error ? err.message : String(err)}` };
  }
}
