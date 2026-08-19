"use client";

import { useEffect, useState } from "react";
import { Settings, ShieldAlert, Save, History, ChevronDown, ChevronUp } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { btnPrimary, btnSecondary, cardPadded, badge, badgeBrand, input, label } from "@/lib/ui-classes";
import {
  getMe,
  listSystemSettings,
  updateSystemSetting,
  listSimilarityWeights,
  updateSimilarityWeights,
  listCostRates,
  updateCostRate,
  listRoles,
  listSkills,
  listSkillVersions,
  createSkillVersion,
  type SystemSettingDTO,
  type SimilarityWeightProfileDTO,
  type CostRateDTO,
  type RoleDTO,
  type SkillDTO,
  type SkillVersionDTO,
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

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  evaluation: "Evaluación",
  pending_approval: "Pendiente de aprobación",
  approved: "Aprobada",
  active: "Activa",
  deprecated: "Deprecada",
};

function SkillCard({ skill, onChanged }: { skill: SkillDTO; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<SkillVersionDTO[] | null>(null);
  const [configDraft, setConfigDraft] = useState(() => JSON.stringify(skill.activeVersion?.definition ?? {}, null, 2));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && !history) {
      listSkillVersions(skill.key).then((res) => setHistory(res.versions));
    }
  }

  async function handleCreateVersion() {
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(configDraft);
    } catch {
      setError("El config debe ser JSON válido (un objeto).");
      return;
    }
    setSaving(true);
    try {
      await createSkillVersion(skill.key, parsed, note.trim() || undefined);
      setNote("");
      setHistory(null);
      onChanged();
      if (expanded) listSkillVersions(skill.key).then((res) => setHistory(res.versions));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la versión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900">{skill.display_name}</h3>
            <span className={badge}>{skill.key}</span>
            {skill.activeVersion && <span className={badgeBrand}>v{skill.activeVersion.version} activa</span>}
          </div>
          {skill.description && <p className="mt-0.5 text-sm text-slate-500">{skill.description}</p>}
          <p className="mt-1 text-xs text-slate-400">{skill.versionCount} versión(es) en total</p>
        </div>
        <button onClick={toggleExpanded} className={btnSecondary}>
          <History className="h-3.5 w-3.5" strokeWidth={2} />
          {expanded ? "Ocultar" : "Ver historial / nueva versión"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="mt-3">
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Config activa {skill.activeVersion ? `(v${skill.activeVersion.version})` : ""}
        </h4>
        {skill.activeVersion ? (
          Object.keys(skill.activeVersion.definition ?? {}).length === 0 ? (
            <p className="text-sm text-slate-400">
              Sin parámetros configurados — esta versión no fija ninguna parametrización, la skill corre con su lógica/valores por defecto
              internos.
            </p>
          ) : (
            <>
              <pre className="max-h-40 overflow-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                {JSON.stringify(skill.activeVersion.definition, null, 2)}
              </pre>
              {skill.activeVersion.note && <p className="mt-1 text-xs text-slate-400">Nota: {skill.activeVersion.note}</p>}
            </>
          )
        ) : (
          <p className="text-sm text-slate-400">Sin versión activa.</p>
        )}
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-700">Historial de versiones</h4>
            {!history ? (
              <p className="text-sm text-slate-400">Cargando…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-400">Sin versiones registradas.</p>
            ) : (
              <div className="space-y-1.5">
                {history.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-medium text-slate-700">v{v.version}</span>
                    <span className={badge}>{STATUS_LABELS[v.status] ?? v.status}</span>
                    <span className="text-slate-400">creada {new Date(v.created_at).toLocaleString()}</span>
                    {v.note && <span className="text-slate-500">— {v.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={label}>Config (JSON) para la nueva versión — precargado con la versión activa, edítalo antes de activar</label>
            <textarea
              value={configDraft}
              onChange={(e) => setConfigDraft(e.target.value)}
              rows={5}
              className={`${input} font-mono text-xs`}
              spellCheck={false}
            />
          </div>
          <div>
            <label className={label}>Nota (opcional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder="Motivo del cambio…" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={handleCreateVersion} disabled={saving} className={btnPrimary}>
            Crear y activar nueva versión
          </button>
        </div>
      )}
    </div>
  );
}

function SkillsSection() {
  const [skills, setSkills] = useState<SkillDTO[]>([]);

  function reload() {
    listSkills().then(setSkills);
  }
  useEffect(reload, []);

  return (
    <div className={cardPadded}>
      <h2 className="mb-1 font-semibold text-slate-900">Skills del agente</h2>
      <p className="mb-4 text-sm text-slate-500">
        Cada Skill ejecuta lógica fija de código; solo su parametrización (umbrales, límites) es versionable acá. Crear una versión nueva la activa
        de inmediato, dejando la anterior como historial.
      </p>
      <div className="space-y-3">
        {skills.map((s) => (
          <SkillCard key={s.key} skill={s} onChanged={reload} />
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
        <SkillsSection />
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
