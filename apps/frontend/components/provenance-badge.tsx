import { PROVENANCE_META, provenanceMeta } from "@/lib/provenance";

/** Punto de color + etiqueta — reemplaza el badge gris genérico para que la procedencia de un número se lea de un vistazo. */
export function ProvenanceBadge({ value }: { value: string }) {
  const meta = provenanceMeta(value);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`} title={meta.hint}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/** Leyenda fija de los 5 valores posibles — se muestra una vez cerca de donde aparecen los badges. */
export function ProvenanceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
      <span className="font-medium text-slate-400">Procedencia:</span>
      {Object.entries(PROVENANCE_META).map(([key, meta]) => (
        <span key={key} className="inline-flex items-center gap-1.5" title={meta.hint}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      ))}
    </div>
  );
}
