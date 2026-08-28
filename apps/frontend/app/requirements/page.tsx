"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Pencil, Trash2, Download, Upload, FileUp, Search, Sparkles } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { RequirementForm } from "@/components/requirement-form";
import { btnPrimary, btnSecondary, iconBtn, iconBtnDanger, card, cardPadded, badge, input } from "@/lib/ui-classes";
import {
  listRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  getRequirement,
  importRequirementsFile,
  downloadRequirementsImportTemplate,
  type RequirementDTO,
  type ImportResultDTO,
} from "@/lib/api-client";

const STATUS_LABELS: Record<string, string> = { new: "Nuevo", in_estimation: "En estimación", estimated: "Estimado" };
const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-600",
  in_estimation: "bg-amber-100 text-amber-700",
  estimated: "bg-emerald-100 text-emerald-700",
};

function ImportSection({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await importRequirementsFile(file);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar el archivo");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className={`${cardPadded} mb-6`}>
      <div className="mb-3 flex items-center gap-2">
        <FileUp className="h-4 w-4 text-accent-600" strokeWidth={2} />
        <h2 className="font-semibold text-slate-900">Carga masiva de requerimientos (Excel/CSV)</h2>
      </div>
      <p className="mb-3 text-sm text-slate-500">Cada fila se procesa de forma independiente — un error en una fila no bloquea el resto.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => downloadRequirementsImportTemplate()} className={btnSecondary}>
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Descargar plantilla
        </button>
        <label className={`${btnPrimary} cursor-pointer`}>
          <Upload className="h-3.5 w-3.5" strokeWidth={2} />
          {importing ? "Importando…" : "Elegir archivo"}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} disabled={importing} className="hidden" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 text-sm">
          <p className="font-medium text-emerald-700">
            {result.imported} de {result.totalRows} fila(s) importadas correctamente{result.skipped > 0 ? `, ${result.skipped} con errores` : ""}.
          </p>
          {result.skipped > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
              {result.results
                .filter((r) => r.status === "skipped")
                .map((r, i) => (
                  <li key={i}>
                    Fila {r.row} ({r.name}): {r.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RequirementsList() {
  const router = useRouter();
  const [requirements, setRequirements] = useState<RequirementDTO[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<RequirementDTO | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function reload(q?: string) {
    listRequirements(q).then(setRequirements);
  }
  useEffect(() => reload(), []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    reload(query || undefined);
  }

  async function startEdit(id: string) {
    setDeleteError(null);
    const data = await getRequirement(id);
    setEditingData(data);
    setEditingId(id);
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    if (!confirm("¿Eliminar este requerimiento? Esta acción no se puede deshacer.")) return;
    try {
      await deleteRequirement(id);
      if (selectedId === id) setSelectedId(null);
      reload(query || undefined);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  function handleEstimate() {
    if (!selectedId) return;
    router.push(`/estimate/new?req=${selectedId}`);
  }

  return (
    <div>
      <PageHeader
        icon={ClipboardList}
        title="Requerimientos"
        subtitle="Catálogo de requerimientos listos para estimar."
        actions={
          <>
            <button onClick={handleEstimate} disabled={!selectedId} className={btnPrimary}>
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              Estimar seleccionado
            </button>
            {!creating && (
              <button onClick={() => setCreating(true)} className={btnSecondary}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Nuevo requerimiento
              </button>
            )}
          </>
        }
      />

      <ImportSection onImported={() => reload(query || undefined)} />

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título o descripción…"
            className={`${input} pl-9`}
          />
        </div>
        <button type="submit" className={btnSecondary}>
          Buscar
        </button>
      </form>

      {creating && (
        <div className="mb-4">
          <RequirementForm
            submitLabel="Crear requerimiento"
            onCancel={() => setCreating(false)}
            onSubmit={(input) => createRequirement(input)}
            onSaved={() => {
              setCreating(false);
              reload(query || undefined);
            }}
          />
        </div>
      )}

      {deleteError && <p className="mb-3 text-sm text-red-600">{deleteError}</p>}

      <div className="space-y-2">
        {requirements.map((r) => (
          <div key={r.id} className={`${card} p-4 ${selectedId === r.id ? "border-brand-400 ring-1 ring-brand-300" : ""}`}>
            {editingId === r.id && editingData ? (
              <RequirementForm
                initial={editingData}
                submitLabel="Guardar cambios"
                onCancel={() => setEditingId(null)}
                onSubmit={(input) => updateRequirement(r.id, input)}
                onSaved={() => {
                  setEditingId(null);
                  reload(query || undefined);
                }}
              />
            ) : (
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="selected-requirement"
                  checked={selectedId === r.id}
                  onChange={() => setSelectedId(r.id)}
                  className="mt-1.5 h-4 w-4 accent-brand-500"
                  disabled={r.status === "estimated"}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={badge}>REQ-{r.number}</span>
                    <p className="font-medium text-slate-900">{r.title}</p>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{r.description}</p>
                  {r.status === "estimated" && r.estimate_id && (
                    <a href={`/estimate/${r.estimate_id}`} className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline">
                      Ver estimación →
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => startEdit(r.id)} className={iconBtn} title="Editar">
                    <Pencil className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className={iconBtnDanger} title="Eliminar">
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {requirements.length === 0 && <p className="text-sm text-slate-400">Sin requerimientos aún.</p>}
      </div>
    </div>
  );
}

export default function RequirementsPage() {
  return (
    <RequireAuth>
      <RequirementsList />
    </RequireAuth>
  );
}
