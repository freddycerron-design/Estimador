"use client";

import { useEffect, useRef, useState } from "react";
import { FolderKanban, Upload, Plus, Pencil, Trash2, Download, FileUp } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { ProjectForm } from "@/components/project-form";
import { btnPrimary, btnSecondary, iconBtn, iconBtnDanger, card, cardPadded, badge, input, label } from "@/lib/ui-classes";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  registerActuals,
  importProjectsFile,
  downloadImportTemplate,
  type ProjectDTO,
  type ProjectDetailDTO,
  type ImportResultDTO,
} from "@/lib/api-client";

const STATUS_LABELS: Record<string, string> = {
  historical_reference: "Referencia histórica",
  active_estimate: "En curso (recién estimado)",
  completed: "Completado",
};

const STATUS_STYLES: Record<string, string> = {
  historical_reference: "bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300",
  active_estimate: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

function ActualsForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [durationWeeks, setDurationWeeks] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await registerActuals(projectId, {
        actualEffortHours: {},
        actualDurationWeeks: durationWeeks ? Number(durationWeeks) : undefined,
        actualCost: cost ? Number(cost) : undefined,
        notes,
      });
      setResult(res);
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        Registrado. Variance vs. estimación: duración {result.durationVariancePct ?? "—"}%, costo {result.costVariancePct ?? "—"}%.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-navy-900/40">
      <div>
        <label className={label}>Duración real (semanas)</label>
        <input value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)} className={`${input} w-24`} />
      </div>
      <div>
        <label className={label}>Costo real</label>
        <input value={cost} onChange={(e) => setCost(e.target.value)} className={`${input} w-28`} />
      </div>
      <div className="min-w-[140px] flex-1">
        <label className={label}>Notas</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
      </div>
      <button type="submit" disabled={submitting} className={btnPrimary}>
        Registrar
      </button>
    </form>
  );
}

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
      const res = await importProjectsFile(file);
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
        <FileUp className="h-4 w-4 text-accent-600 dark:text-accent-400" strokeWidth={2} />
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Importar proyectos históricos (Excel/CSV)</h2>
      </div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Carga un archivo .csv o .xlsx con proyectos históricos. Cada fila se procesa de forma independiente — un error en una fila no
        bloquea el resto.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => downloadImportTemplate()} className={btnSecondary}>
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Descargar plantilla
        </button>
        <label className={`${btnPrimary} cursor-pointer`}>
          <Upload className="h-3.5 w-3.5" strokeWidth={2} />
          {importing ? "Importando…" : "Elegir archivo"}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} disabled={importing} className="hidden" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {result && (
        <div className="mt-3 text-sm">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            {result.imported} de {result.totalRows} fila(s) importadas correctamente{result.skipped > 0 ? `, ${result.skipped} con errores` : ""}.
          </p>
          {result.skipped > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-red-600 dark:text-red-400">
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

function ProjectsList() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [openActualsFor, setOpenActualsFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<ProjectDetailDTO | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function reload() {
    listProjects().then(setProjects);
  }
  useEffect(reload, []);

  async function startEdit(id: string) {
    setDeleteError(null);
    const data = await getProject(id);
    setEditingData(data);
    setEditingId(id);
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    if (!confirm("¿Eliminar este proyecto histórico? Esta acción no se puede deshacer.")) return;
    try {
      await deleteProject(id);
      reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  return (
    <div>
      <PageHeader
        icon={FolderKanban}
        title="Proyectos"
        subtitle="Histórico de referencia, importación y resultados reales."
        actions={
          !creating && (
            <button onClick={() => setCreating(true)} className={btnPrimary}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Nuevo proyecto histórico
            </button>
          )
        }
      />

      <ImportSection onImported={reload} />

      {creating && (
        <div className="mb-4">
          <ProjectForm
            submitLabel="Crear proyecto"
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              await createProject(input);
              setCreating(false);
              reload();
            }}
          />
        </div>
      )}

      {deleteError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{deleteError}</p>}

      <div className="space-y-2">
        {projects.map((p) => (
          <div key={p.id} className={`${card} p-4`}>
            {editingId === p.id && editingData ? (
              <ProjectForm
                initial={editingData}
                submitLabel="Guardar cambios"
                onCancel={() => setEditingId(null)}
                onSubmit={async (input) => {
                  await updateProject(p.id, input);
                  setEditingId(null);
                  reload();
                }}
              />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{p.name}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[p.status] ?? "bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300"
                        }`}
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {p.project_type}
                      {p.duration_weeks && ` · ${p.duration_weeks} semanas`}
                      {p.actual_cost && ` · $${Number(p.actual_cost).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {p.status === "active_estimate" && (
                      <button
                        onClick={() => setOpenActualsFor(openActualsFor === p.id ? null : p.id)}
                        className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                      >
                        Registrar resultado real
                      </button>
                    )}
                    <button onClick={() => startEdit(p.id)} className={iconBtn} title="Editar">
                      <Pencil className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className={iconBtnDanger} title="Eliminar">
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
                {openActualsFor === p.id && <ActualsForm projectId={p.id} onDone={reload} />}
              </>
            )}
          </div>
        ))}
        {projects.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">Sin proyectos aún.</p>}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <RequireAuth>
      <ProjectsList />
    </RequireAuth>
  );
}
