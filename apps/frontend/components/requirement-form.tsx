"use client";

import { useEffect, useState } from "react";
import { Paperclip, X, FileText, AlertTriangle } from "lucide-react";
import type { RequirementFormInput, RequirementDTO, RequirementAttachmentDTO } from "@/lib/api-client";
import { listRequirementAttachments, uploadRequirementAttachment, deleteRequirementAttachment } from "@/lib/api-client";
import { btnPrimary, btnSecondary, input as inputClass, label as labelClass } from "@/lib/ui-classes";

const COMPLEXITY_OPTIONS = ["low", "medium", "high", "very_high"] as const;
const COMPLEXITY_LABELS: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta", very_high: "Muy alta" };

// Formatos que attachment-extraction.ts sabe leer — ver mensaje de "unsupported" en el backend.
const ACCEPTED_EXTENSIONS = ".pdf,.docx,.pptx,.xlsx,.xls,.txt,.md,.csv";

function toCsv(list: string[] | undefined): string {
  return (list ?? []).join(", ");
}
function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_LABELS: Record<RequirementAttachmentDTO["extraction_status"], string> = {
  ok: "Leído",
  unsupported: "Formato no soportado",
  error: "No se pudo leer",
};
const STATUS_STYLES: Record<RequirementAttachmentDTO["extraction_status"], string> = {
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  unsupported: "bg-slate-100 text-slate-500 dark:bg-navy-700 dark:text-slate-400",
  error: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export function RequirementForm({
  initial,
  onSubmit,
  onSaved,
  onCancel,
  submitLabel,
}: {
  initial?: RequirementDTO;
  /** Guarda solo los campos del requerimiento (crear o actualizar) — sin efectos secundarios de UI, para poder subir los adjuntos antes de que el padre cierre el formulario. */
  onSubmit: (input: RequirementFormInput) => Promise<RequirementDTO>;
  /** Se llama cuando el requerimiento y todos sus adjuntos ya se guardaron — acá el padre cierra el formulario/recarga la lista. */
  onSaved: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [projectType, setProjectType] = useState(initial?.project_type ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [technologies, setTechnologies] = useState(toCsv(initial?.technologies));
  const [modules, setModules] = useState(toCsv(initial?.modules));
  const [integrations, setIntegrations] = useState(toCsv(initial?.integrations));
  const [numUsers, setNumUsers] = useState(initial?.num_users?.toString() ?? "");
  const [numInterfaces, setNumInterfaces] = useState(initial?.num_interfaces?.toString() ?? "");
  const [complexity, setComplexity] = useState(initial?.complexity ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjuntos con mayor detalle del requerimiento (spec pedido por usuario) — se leen en el
  // backend al subirlos y ese texto se incluye luego en el mensaje inicial de la estimación.
  const [existingAttachments, setExistingAttachments] = useState<RequirementAttachmentDTO[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (initial) listRequirementAttachments(initial.id).then(setExistingAttachments);
  }, [initial?.id]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function removeExistingAttachment(attachmentId: string) {
    if (!initial) return;
    setDeletingId(attachmentId);
    try {
      await deleteRequirementAttachment(initial.id, attachmentId);
      setExistingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el adjunto");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const saved = await onSubmit({
        title,
        description,
        projectType: projectType || null,
        industry: industry || null,
        technologies: fromCsv(technologies),
        modules: fromCsv(modules),
        integrations: fromCsv(integrations),
        numUsers: numUsers ? Number(numUsers) : null,
        numInterfaces: numInterfaces ? Number(numInterfaces) : null,
        complexity: (complexity || null) as RequirementFormInput["complexity"],
      });

      const uploadErrors: string[] = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        setUploadingIndex(i);
        try {
          await uploadRequirementAttachment(saved.id, pendingFiles[i]!);
        } catch (err) {
          uploadErrors.push(`${pendingFiles[i]!.name}: ${err instanceof Error ? err.message : "error al subir"}`);
        }
      }
      setUploadingIndex(null);
      setPendingFiles([]);

      if (uploadErrors.length > 0) {
        setError(`El requerimiento se guardó, pero algunos adjuntos no se pudieron subir — ${uploadErrors.join("; ")}`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-accent-200 bg-accent-50/40 p-4 dark:border-accent-500/30 dark:bg-accent-500/10">
      <div>
        <label className={labelClass}>Título *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>Descripción *</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} rows={3} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Tipo de proyecto</label>
          <input value={projectType ?? ""} onChange={(e) => setProjectType(e.target.value)} className={inputClass} placeholder="ej. internal_business_app" />
        </div>
        <div>
          <label className={labelClass}>Industria</label>
          <input value={industry ?? ""} onChange={(e) => setIndustry(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Tecnologías (separadas por coma)</label>
        <input value={technologies} onChange={(e) => setTechnologies(e.target.value)} className={inputClass} placeholder="React, Node.js, PostgreSQL" />
      </div>
      <div>
        <label className={labelClass}>Módulos (separados por coma)</label>
        <input value={modules} onChange={(e) => setModules(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Integraciones (separadas por coma)</label>
        <input value={integrations} onChange={(e) => setIntegrations(e.target.value)} className={inputClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Usuarios</label>
          <input value={numUsers} onChange={(e) => setNumUsers(e.target.value)} className={inputClass} type="number" />
        </div>
        <div>
          <label className={labelClass}>Interfaces</label>
          <input value={numInterfaces} onChange={(e) => setNumInterfaces(e.target.value)} className={inputClass} type="number" />
        </div>
        <div>
          <label className={labelClass}>Complejidad</label>
          <select value={complexity ?? ""} onChange={(e) => setComplexity(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {COMPLEXITY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {COMPLEXITY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t border-accent-200 pt-3 dark:border-accent-500/30">
        <label className={labelClass}>Archivos con más detalle del requerimiento</label>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Se leen automáticamente y su contenido se incluye al iniciar la estimación de este requerimiento. Formatos soportados: PDF, Word
          (.docx), PowerPoint (.pptx), Excel (.xlsx/.xls), texto plano (.txt/.md/.csv).
        </p>

        {existingAttachments.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {existingAttachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-navy-600 dark:bg-navy-800"
              >
                <FileText className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" strokeWidth={2} />
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{a.filename}</span>
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatSize(a.size_bytes)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.extraction_status]}`} title={a.extraction_note ?? undefined}>
                  {STATUS_LABELS[a.extraction_status]}
                </span>
                <button
                  type="button"
                  onClick={() => removeExistingAttachment(a.id)}
                  disabled={deletingId === a.id}
                  className="shrink-0 text-slate-400 hover:text-red-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-red-400"
                  title="Eliminar adjunto"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {pendingFiles.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {pendingFiles.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-dashed border-accent-300 bg-white px-3 py-1.5 text-sm dark:border-accent-500/40 dark:bg-navy-800"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-accent-500" strokeWidth={2} />
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{f.name}</span>
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatSize(f.size)}</span>
                {uploadingIndex === i ? (
                  <span className="shrink-0 text-xs text-accent-600 dark:text-accent-400">Subiendo…</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    className="shrink-0 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                    title="Quitar"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <label className={`${btnSecondary} inline-flex cursor-pointer`}>
          <Paperclip className="h-3.5 w-3.5" strokeWidth={2} />
          Adjuntar archivo(s)
          <input type="file" multiple accept={ACCEPTED_EXTENSIONS} onChange={(e) => addFiles(e.target.files)} className="hidden" />
        </label>
        {!initial && pendingFiles.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <AlertTriangle className="h-3 w-3" strokeWidth={2} />
            Se subirán al guardar el requerimiento.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={submitting} className={btnPrimary}>
          {submitting ? "Guardando…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
