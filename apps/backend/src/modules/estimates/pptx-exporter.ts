// pptxgenjs es CJS sin campo "exports" en package.json; bajo NodeNext + ESM, el import
// por defecto de TS no resuelve bien la clase constructable (error de tipos conocido de la
// librería). Se importa como namespace y se toma `.default` en runtime, tipado como `any`
// en el punto de construcción — el resto del archivo sigue tipado normalmente contra `Slide`.
import * as PptxGenJSModule from "pptxgenjs";
import type { EstimateExportData } from "./export-data.js";

type PptxSlide = any;
const PptxGenJS: any = (PptxGenJSModule as any).default ?? PptxGenJSModule;

const BRAND = "2645C9";
const BRAND_LIGHT = "EEF2FF";
const INK = "1E293B";
const MUTED = "64748B";

/**
 * Versión inicial de la presentación ejecutiva (a criterio propio — el usuario pidió una
 * primera versión para después refinar con una plantilla de marca). 16:9, diseño simple y
 * legible: portada, resumen, estimación, esfuerzo, referencias, riesgos/confianza.
 */
export function buildEstimatePptx(data: EstimateExportData): Promise<Buffer> {
  const { estimate } = data;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";

  const confidencePct = estimate.confidence_score ? Math.round(Number(estimate.confidence_score) * 100) : null;

  // --- Portada ---
  const cover = pptx.addSlide();
  cover.background = { color: BRAND };
  cover.addText("Estimación de Proyecto de TI", { x: 0.7, y: 2.6, w: 12, h: 1, fontSize: 14, color: "C7D2FE", bold: true });
  cover.addText(data.projectName, { x: 0.7, y: 3.1, w: 12, h: 1.5, fontSize: 34, color: "FFFFFF", bold: true });
  cover.addText(new Date(estimate.created_at).toLocaleDateString("es"), { x: 0.7, y: 6.6, w: 6, h: 0.5, fontSize: 12, color: "C7D2FE" });

  // --- Resumen ---
  const summary = pptx.addSlide();
  addHeader(summary, "Resumen");
  summary.addText(data.projectDescription || "Sin descripción disponible.", { x: 0.7, y: 1.4, w: 11.9, h: 2, fontSize: 16, color: INK, valign: "top" });
  summary.addText(estimate.template_used === "detailed" ? "Plantilla: Detallada" : "Plantilla: Ejecutiva", {
    x: 0.7,
    y: 6.8,
    fontSize: 11,
    color: MUTED,
  });

  // --- Estimación (números grandes) ---
  const est = pptx.addSlide();
  addHeader(est, "Estimación");
  const cards: { label: string; value: string }[] = [
    { label: "Duración probable", value: `${estimate.duration_weeks_probable ?? "—"} semanas` },
    { label: "Costo probable", value: `${estimate.currency} ${fmt(estimate.cost_probable)}` },
    { label: "Confianza", value: confidencePct !== null ? `${confidencePct}%` : "—" },
  ];
  cards.forEach((c, i) => {
    const x = 0.7 + i * 4.1;
    est.addShape(pptx.ShapeType.roundRect, { x, y: 1.6, w: 3.8, h: 2.2, fill: { color: BRAND_LIGHT }, line: { color: BRAND_LIGHT }, rectRadius: 0.1 });
    est.addText(c.value, { x, y: 1.9, w: 3.8, h: 1, align: "center", fontSize: 26, bold: true, color: BRAND });
    est.addText(c.label, { x, y: 2.9, w: 3.8, h: 0.6, align: "center", fontSize: 13, color: MUTED });
  });
  est.addTable(
    [
      ["", "Optimista", "Probable", "Pesimista"],
      ["Duración (semanas)", String(estimate.duration_weeks_optimistic ?? "—"), String(estimate.duration_weeks_probable ?? "—"), String(estimate.duration_weeks_pessimistic ?? "—")],
      [`Costo (${estimate.currency})`, fmt(estimate.cost_optimistic), fmt(estimate.cost_probable), fmt(estimate.cost_pessimistic)],
    ],
    { x: 0.7, y: 4.3, w: 11.9, fontSize: 13, border: { type: "solid", color: "E2E8F0" }, color: INK, fill: { color: "FFFFFF" } }
  );

  // --- Esfuerzo por fase/rol ---
  if (data.lineItems.length > 0) {
    const effort = pptx.addSlide();
    addHeader(effort, "Esfuerzo por fase y rol");
    const rows = [["Fase", "Rol", "Horas"], ...data.lineItems.map((li) => [li.phaseName, li.roleName, String(li.hours)])];
    effort.addTable(rows, { x: 0.7, y: 1.4, w: 6, fontSize: 11, border: { type: "solid", color: "E2E8F0" }, color: INK, autoPage: false });

    const byRole = new Map<string, number>();
    for (const li of data.lineItems) byRole.set(li.roleName, (byRole.get(li.roleName) ?? 0) + li.hours);
    effort.addChart(
      pptx.ChartType.bar,
      [{ name: "Horas", labels: [...byRole.keys()], values: [...byRole.values()] }],
      { x: 7.1, y: 1.4, w: 5.5, h: 5.5, barDir: "bar", chartColors: [BRAND], showValue: true, dataLabelColor: INK }
    );
  }

  // --- Referencias históricas ---
  if (data.referenceProjects.length > 0) {
    const refs = pptx.addSlide();
    addHeader(refs, "Referencias históricas");
    const rows = [
      ["Proyecto", "Similitud", "Outlier"],
      ...data.referenceProjects.map((r) => [r.projectName, `${Math.round(r.similarityScore * 100)}%`, r.isOutlier ? "Sí" : "No"]),
    ];
    refs.addTable(rows, { x: 0.7, y: 1.4, w: 11.9, fontSize: 13, border: { type: "solid", color: "E2E8F0" }, color: INK });
  }

  // --- Riesgos y confianza ---
  const risksSlide = pptx.addSlide();
  addHeader(risksSlide, "Riesgos y confianza");
  const risks = estimate.risks ?? [];
  risksSlide.addText(risks.length > 0 ? risks.map((r) => `• ${r}`).join("\n") : "Sin riesgos identificados.", {
    x: 0.7,
    y: 1.4,
    w: 7,
    h: 5,
    fontSize: 14,
    color: INK,
    valign: "top",
    lineSpacingMultiple: 1.3,
  });
  risksSlide.addText(
    confidencePct !== null
      ? `Nivel de confianza: ${confidencePct}%\n\nBasado en similitud histórica, cantidad de referencias, dispersión de resultados y completitud de la información — ver detalle en la aplicación.`
      : "Nivel de confianza no disponible.",
    { x: 8, y: 1.4, w: 4.6, h: 5, fontSize: 13, color: MUTED, valign: "top" }
  );

  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

function addHeader(slide: PptxSlide, title: string) {
  slide.addText(title, { x: 0.7, y: 0.5, w: 11.9, h: 0.7, fontSize: 24, bold: true, color: INK });
  slide.addShape("line", { x: 0.7, y: 1.25, w: 11.9, h: 0, line: { color: "E2E8F0", width: 1 } });
}

function fmt(value: string | number | null): string {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString();
}
