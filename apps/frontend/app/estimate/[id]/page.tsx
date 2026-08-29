"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Download, Presentation, Star } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { getEstimate, sendFeedback, downloadEstimateExport } from "@/lib/api-client";
import { btnSecondary, btnPrimary, card, cardPadded, badge, input, label } from "@/lib/ui-classes";
import { ProvenanceBadge, ProvenanceLegend } from "@/components/provenance-badge";

function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof getEstimate>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(4);
  const [comments, setComments] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pptx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport(format: "excel" | "pptx") {
    setExporting(format);
    setExportError(null);
    try {
      await downloadEstimateExport(id, format);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "No se pudo generar el archivo");
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    getEstimate(id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar la estimación"));
  }, [id]);

  if (error) return <p className="text-red-600 dark:text-red-400">{error}</p>;
  if (!data) return <p className="text-slate-400 dark:text-slate-500">Cargando…</p>;

  const est = data.estimate as Record<string, any>;

  async function handleFeedback(e: React.FormEvent) {
    e.preventDefault();
    await sendFeedback(id, rating, comments);
    setFeedbackSent(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Estimación"
        subtitle={`Estado: ${est.status} · Plantilla: ${est.template_used ?? "—"}`}
        actions={
          <>
            <button onClick={() => handleExport("excel")} disabled={exporting !== null} className={btnSecondary}>
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              {exporting === "excel" ? "Generando…" : "Excel"}
            </button>
            <button onClick={() => handleExport("pptx")} disabled={exporting !== null} className={btnSecondary}>
              <Presentation className="h-3.5 w-3.5" strokeWidth={2} />
              {exporting === "pptx" ? "Generando…" : "PowerPoint"}
            </button>
          </>
        }
      />
      {exportError && <p className="text-sm text-red-600 dark:text-red-400">{exportError}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={cardPadded}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Duración (semanas)</p>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {est.duration_weeks_optimistic}–{est.duration_weeks_pessimistic}{" "}
            <span className="text-brand-600 dark:text-brand-400">({est.duration_weeks_probable} probable)</span>
          </p>
        </div>
        <div className={cardPadded}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Costo ({est.currency})</p>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {Number(est.cost_optimistic).toLocaleString()}–{Number(est.cost_pessimistic).toLocaleString()}{" "}
            <span className="text-brand-600 dark:text-brand-400">({Number(est.cost_probable).toLocaleString()} probable)</span>
          </p>
        </div>
        <div className={cardPadded}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Confianza</p>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {Math.round(Number(est.confidence_score) * 100)}%{" "}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              {est.similarity_threshold_met ? "· umbral cumplido" : "· bajo umbral"}
            </span>
          </p>
        </div>
      </div>

      <div className={cardPadded}>
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">Proyectos de referencia</h2>
        {data.referenceProjects.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Ninguno superó el umbral de similitud.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.referenceProjects.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-medium text-slate-800 dark:text-slate-200">{r.projectName}</span>
                <span className={badge}>{Math.round(Number(r.similarity_score) * 100)}% similitud</span>
                {r.is_outlier && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    outlier, excluido
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cardPadded}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Esfuerzo por fase y rol</h2>
          <ProvenanceLegend />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-navy-700 dark:text-slate-500">
              <th className="py-2">Fase</th>
              <th>Rol</th>
              <th>Horas</th>
              <th>Procedencia</th>
            </tr>
          </thead>
          <tbody>
            {data.lineItems.map((li, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-navy-700">
                <td className="py-2 text-slate-700 dark:text-slate-300">{li.phaseName}</td>
                <td className="text-slate-700 dark:text-slate-300">{li.roleName}</td>
                <td className="font-display font-medium tabular-nums text-slate-900 dark:text-slate-100">{li.hours}</td>
                <td>
                  <ProvenanceBadge value={li.provenance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={cardPadded}>
        <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
          <Star className="h-4 w-4 text-accent-500" strokeWidth={2} />
          Feedback
        </h2>
        {feedbackSent ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">¡Gracias! Tu feedback queda registrado para el ciclo de aprendizaje.</p>
        ) : (
          <form onSubmit={handleFeedback} className="space-y-3">
            <div>
              <label className={label}>Calificación (1-5)</label>
              <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} className={`${input} w-20`} />
            </div>
            <div>
              <label className={label}>Comentarios</label>
              <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} className={input} />
            </div>
            <button type="submit" className={btnPrimary}>
              Enviar feedback
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function EstimateDetailPage() {
  return (
    <RequireAuth>
      <EstimateDetail />
    </RequireAuth>
  );
}
