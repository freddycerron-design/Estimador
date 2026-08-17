"use client";

import { useState } from "react";
import type { ProjectFormInput, ProjectDetailDTO } from "@/lib/api-client";
import { btnPrimary, btnSecondary, input as inputClass, label as labelClass } from "@/lib/ui-classes";

const COMPLEXITY_OPTIONS = ["low", "medium", "high", "very_high"] as const;
const COMPLEXITY_LABELS: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta", very_high: "Muy alta" };

function featureValue<T>(features: ProjectDetailDTO["features"] | undefined, key: string, fallback: T): T {
  const row = features?.find((f) => f.feature_key === key);
  return row ? (row.feature_value as T) : fallback;
}

function toCsv(list: string[] | undefined): string {
  return (list ?? []).join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProjectForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: ProjectDetailDTO;
  onSubmit: (input: ProjectFormInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [projectType, setProjectType] = useState(initial?.project_type ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [technologies, setTechnologies] = useState(toCsv(initial?.technologies));
  const [modules, setModules] = useState(toCsv(featureValue(initial?.features, "modules", [])));
  const [integrations, setIntegrations] = useState(toCsv(featureValue(initial?.features, "integrations", [])));
  const [teamSize, setTeamSize] = useState(initial?.team_size?.toString() ?? "");
  const [numUsers, setNumUsers] = useState(featureValue<number | null>(initial?.features, "num_users", null)?.toString() ?? "");
  const [numInterfaces, setNumInterfaces] = useState(featureValue<number | null>(initial?.features, "num_interfaces", null)?.toString() ?? "");
  const [complexity, setComplexity] = useState(featureValue<string | null>(initial?.features, "complexity", null) ?? "");
  const [durationWeeks, setDurationWeeks] = useState(initial?.duration_weeks ?? "");
  const [actualCost, setActualCost] = useState(initial?.actual_cost ?? "");
  const [totalHours, setTotalHours] = useState("");
  const [risks, setRisks] = useState(toCsv(featureValue(initial?.features, "risks", [])));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name,
        description,
        projectType,
        industry: industry || null,
        technologies: fromCsv(technologies),
        modules: fromCsv(modules),
        integrations: fromCsv(integrations),
        teamSize: teamSize ? Number(teamSize) : null,
        numUsers: numUsers ? Number(numUsers) : null,
        numInterfaces: numInterfaces ? Number(numInterfaces) : null,
        complexity: (complexity || null) as ProjectFormInput["complexity"],
        durationWeeks: durationWeeks ? Number(durationWeeks) : null,
        actualCost: actualCost ? Number(actualCost) : null,
        totalHours: totalHours ? Number(totalHours) : null,
        risks: fromCsv(risks),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSubmitting(false);
    }
  }

  const field = inputClass;
  const label = labelClass;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-accent-200 bg-accent-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Nombre *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} required />
        </div>
        <div>
          <label className={label}>Tipo de proyecto *</label>
          <input value={projectType} onChange={(e) => setProjectType(e.target.value)} className={field} placeholder="ej. internal_business_app" required />
        </div>
      </div>
      <div>
        <label className={label}>Descripción *</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={field} rows={2} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Industria</label>
          <input value={industry ?? ""} onChange={(e) => setIndustry(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Complejidad</label>
          <select value={complexity} onChange={(e) => setComplexity(e.target.value)} className={field}>
            <option value="">—</option>
            {COMPLEXITY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {COMPLEXITY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Tecnologías (separadas por coma)</label>
        <input value={technologies} onChange={(e) => setTechnologies(e.target.value)} className={field} placeholder="React, Node.js, PostgreSQL" />
      </div>
      <div>
        <label className={label}>Módulos (separados por coma)</label>
        <input value={modules} onChange={(e) => setModules(e.target.value)} className={field} />
      </div>
      <div>
        <label className={label}>Integraciones (separadas por coma)</label>
        <input value={integrations} onChange={(e) => setIntegrations(e.target.value)} className={field} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={label}>Tamaño de equipo</label>
          <input value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className={field} type="number" />
        </div>
        <div>
          <label className={label}>Usuarios</label>
          <input value={numUsers} onChange={(e) => setNumUsers(e.target.value)} className={field} type="number" />
        </div>
        <div>
          <label className={label}>Interfaces</label>
          <input value={numInterfaces} onChange={(e) => setNumInterfaces(e.target.value)} className={field} type="number" />
        </div>
        <div>
          <label className={label}>Duración (semanas)</label>
          <input value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)} className={field} type="number" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Costo real</label>
          <input value={actualCost} onChange={(e) => setActualCost(e.target.value)} className={field} type="number" />
        </div>
        {!initial && (
          <div>
            <label className={label}>Horas totales reales (sin desglose por fase/rol)</label>
            <input value={totalHours} onChange={(e) => setTotalHours(e.target.value)} className={field} type="number" />
          </div>
        )}
      </div>
      <div>
        <label className={label}>Riesgos (separados por coma)</label>
        <input value={risks} onChange={(e) => setRisks(e.target.value)} className={field} />
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
