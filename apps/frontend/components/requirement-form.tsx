"use client";

import { useState } from "react";
import type { RequirementFormInput, RequirementDTO } from "@/lib/api-client";
import { btnPrimary, btnSecondary, input as inputClass, label as labelClass } from "@/lib/ui-classes";

const COMPLEXITY_OPTIONS = ["low", "medium", "high", "very_high"] as const;
const COMPLEXITY_LABELS: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta", very_high: "Muy alta" };

function toCsv(list: string[] | undefined): string {
  return (list ?? []).join(", ");
}
function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function RequirementForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: RequirementDTO;
  onSubmit: (input: RequirementFormInput) => Promise<void>;
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-accent-200 bg-accent-50/40 p-4">
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

      {error && <p className="text-sm text-red-600">{error}</p>}
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
