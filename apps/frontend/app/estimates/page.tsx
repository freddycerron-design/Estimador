"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, ArrowRight, RefreshCw, Plus } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { btnPrimary, card } from "@/lib/ui-classes";
import { listEstimates, type EstimateSummaryDTO } from "@/lib/api-client";

function confidenceBadge(score: string | null): { label: string; className: string } {
  if (score === null) return { label: "—", className: "bg-slate-100 text-slate-500" };
  const pct = Math.round(Number(score) * 100);
  if (pct >= 75) return { label: `${pct}% Alto`, className: "bg-emerald-100 text-emerald-700" };
  if (pct >= 50) return { label: `${pct}% Medio`, className: "bg-amber-100 text-amber-700" };
  return { label: `${pct}% Bajo`, className: "bg-red-100 text-red-700" };
}

function EstimatesList() {
  const [estimates, setEstimates] = useState<EstimateSummaryDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEstimates()
      .then(setEstimates)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar estimaciones"));
  }, []);

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Estimaciones"
        subtitle="Todas las estimaciones generadas por el agente."
        actions={
          <Link href="/estimate/new" className={btnPrimary}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Estimación sin requerimiento registrado
          </Link>
        }
      />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5">Proyecto</th>
              <th className="px-4 py-2.5">Plantilla</th>
              <th className="px-4 py-2.5">Duración (sem.)</th>
              <th className="px-4 py-2.5">Costo</th>
              <th className="px-4 py-2.5">Confianza</th>
              <th className="px-4 py-2.5">Fecha</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((e) => {
              const conf = confidenceBadge(e.confidence_score);
              return (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{e.projectName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{e.template_used ?? "—"}</td>
                  <td className="px-4 py-3">{e.duration_weeks_probable ?? "—"}</td>
                  <td className="px-4 py-3">
                    {e.currency} {e.cost_probable ? Number(e.cost_probable).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${conf.className}`}>{conf.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(e.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/estimate/${e.id}`} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                        Ver <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                      </Link>
                      {/* Refinamiento (spec pedido por usuario): arranca una estimación nueva precargando
                          los parámetros (y descripción original, si aplica) de esta estimación. */}
                      <Link
                        href={`/estimate/new?refineFrom=${e.id}`}
                        className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-brand-600 hover:underline"
                        title="Iniciar una nueva estimación a partir de esta, reutilizando sus parámetros"
                      >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                        Refinar estimación
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {estimates.length === 0 && !error && (
          <p className="p-6 text-center text-sm text-slate-400">
            Aún no hay estimaciones. Crea una desde un requerimiento registrado, o con &ldquo;Estimación sin requerimiento registrado&rdquo; arriba.
          </p>
        )}
      </div>
    </div>
  );
}

export default function EstimatesPage() {
  return (
    <RequireAuth>
      <EstimatesList />
    </RequireAuth>
  );
}
