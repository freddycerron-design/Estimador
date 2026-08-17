"use client";

import { useEffect, useState } from "react";
import { Settings, ShieldAlert, Save } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { btnPrimary, cardPadded, input, label } from "@/lib/ui-classes";
import {
  getMe,
  listSystemSettings,
  updateSystemSetting,
  listSimilarityWeights,
  updateSimilarityWeights,
  listCostRates,
  updateCostRate,
  listRoles,
  type SystemSettingDTO,
  type SimilarityWeightProfileDTO,
  type CostRateDTO,
  type RoleDTO,
} from "@/lib/api-client";

const SETTING_LABELS: Record<string, string> = {
  MIN_SIMILARITY_THRESHOLD: "Umbral mínimo de similitud (0-1)",
  MAX_ADAPTIVE_ITERATIONS: "Máx. iteraciones de preguntas adaptativas",
  DEFAULT_CONTINGENCY_PCT: "Contingencia por defecto (0-1)",
  DEFAULT_OVERHEAD_PCT: "Overhead por defecto (0-1)",
  OUTLIER_ZSCORE_THRESHOLD: "Umbral de outlier (score-Z modificado)",
  MIN_SAMPLE_SIZE_FOR_PATTERN: "Muestra mínima para detectar un patrón (Learning Agent)",
  PATTERN_VARIANCE_THRESHOLD_PCT: "Desviación mínima para considerar un patrón (%)",
  PROPOSAL_IMPROVEMENT_THRESHOLD_PCT: "Mejora mínima para aprobar una propuesta (puntos %)",
};

const DIMENSION_LABELS: Record<string, string> = {
  functionality: "Funcionalidad",
  technology: "Tecnología",
  complexity: "Complejidad",
  integrations: "Integraciones",
  size: "Tamaño",
  scope: "Alcance",
  context: "Contexto",
};

function SettingsSection() {
  const [settings, setSettings] = useState<SystemSettingDTO[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  function reload() {
    listSystemSettings().then((rows) => {
      setSettings(rows);
      setDrafts(Object.fromEntries(rows.map((r) => [r.key, JSON.stringify(r.value)])));
    });
  }
  useEffect(reload, []);

  async function handleSave(key: string) {
    setSavingKey(key);
    try {
      const value = JSON.parse(drafts[key] ?? "null");
      await updateSystemSetting(key, value);
      reload();
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className={cardPadded}>
      <h2 className="mb-1 font-semibold text-slate-900">Parámetros del sistema</h2>
      <p className="mb-4 text-sm text-slate-500">Umbrales que controlan la similitud, el aprendizaje y los cálculos de estimación — nunca hardcodeados en el código.</p>
      <div className="space-y-3">
        {settings.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <label className="w-80 shrink-0 text-sm text-slate-600">{SETTING_LABELS[s.key] ?? s.key}</label>
            <input value={drafts[s.key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))} className={`${input} max-w-[140px]`} />
            <button onClick={() => handleSave(s.key)} disabled={savingKey === s.key} className="text-brand-600 hover:text-brand-700 disabled:opacity-50" title="Guardar">
              <Save className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeightsSection() {
  const [profiles, setProfiles] = useState<SimilarityWeightProfileDTO[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    listSimilarityWeights().then((rows) => {
      setProfiles(rows);
      const active = rows.find((r) => r.is_active) ?? rows[0];
      if (active) setDraft(Object.fromEntries(Object.entries(active.weights).map(([k, v]) => [k, String(v)])));
    });
  }
  useEffect(reload, []);

  const sum = Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0);

  async function handleSave() {
    setError(null);
    const weights = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)]));
    setSaving(true);
    try {
      await updateSimilarityWeights(weights);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cardPadded}>
      <h2 className="mb-1 font-semibold text-slate-900">Pesos de similitud</h2>
      <p className="mb-4 text-sm text-slate-500">Deben sumar 1.0. Cada cambio crea una nueva versión activa — nunca sobreescribe la anterior.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.keys(DIMENSION_LABELS).map((dim) => (
          <div key={dim} className="flex items-center gap-2">
            <label className="w-32 shrink-0 text-sm text-slate-600">{DIMENSION_LABELS[dim]}</label>
            <input
              value={draft[dim] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [dim]: e.target.value }))}
              className={`${input} max-w-[100px]`}
              type="number"
              step="0.01"
              min="0"
              max="1"
            />
          </div>
        ))}
      </div>
      <p className={`mt-3 text-sm font-medium ${Math.abs(sum - 1) < 1e-6 ? "text-emerald-600" : "text-red-600"}`}>Suma actual: {sum.toFixed(2)} {Math.abs(sum - 1) >= 1e-6 && "(debe ser 1.00)"}</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button onClick={handleSave} disabled={saving || Math.abs(sum - 1) >= 1e-6} className={`${btnPrimary} mt-3`}>
        Guardar nueva versión
      </button>
      <p className="mt-3 text-xs text-slate-400">Versión activa: v{profiles.find((p) => p.is_active)?.version ?? "—"}</p>
    </div>
  );
}

function RatesSection() {
  const [rates, setRates] = useState<CostRateDTO[]>([]);
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingRole, setSavingRole] = useState<string | null>(null);

  function reload() {
    Promise.all([listCostRates(), listRoles()]).then(([r, ro]) => {
      setRates(r);
      setRoles(ro);
      setDrafts(Object.fromEntries(r.map((x) => [x.role_id, x.rate_per_hour])));
    });
  }
  useEffect(reload, []);

  async function handleSave(roleId: string) {
    setSavingRole(roleId);
    try {
      await updateCostRate(roleId, Number(drafts[roleId]));
      reload();
    } finally {
      setSavingRole(null);
    }
  }

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  return (
    <div className={cardPadded}>
      <h2 className="mb-1 font-semibold text-slate-900">Tarifas por rol</h2>
      <p className="mb-4 text-sm text-slate-500">USD/hora. Cada cambio crea una nueva versión vigente, desactivando la anterior.</p>
      <div className="space-y-2">
        {rates.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <label className="w-48 shrink-0 text-sm text-slate-600">{roleName(r.role_id)}</label>
            <input
              value={drafts[r.role_id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [r.role_id]: e.target.value }))}
              className={`${input} max-w-[120px]`}
              type="number"
            />
            <button onClick={() => handleSave(r.role_id)} disabled={savingRole === r.role_id} className="text-brand-600 hover:text-brand-700 disabled:opacity-50" title="Guardar">
              <Save className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminContent() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    getMe()
      .then((me) => setAuthorized(me.app_role === "admin"))
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) return <p className="text-slate-400">Verificando permisos…</p>;

  if (!authorized) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-slate-300" strokeWidth={1.5} />
        <p className="text-slate-600">Esta sección requiere rol de administrador.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader icon={Settings} title="Administración" subtitle="Parámetros de similitud, tarifas y configuración del sistema." />
      <div className="space-y-6">
        <SettingsSection />
        <WeightsSection />
        <RatesSection />
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AdminContent />
    </RequireAuth>
  );
}
