"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send, Plus, Hash, SlidersHorizontal, Loader2 } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { btnPrimary, btnSecondary, cardPadded, input as inputClass } from "@/lib/ui-classes";
import {
  createConversation,
  sendMessage,
  getConversation,
  getRequirement,
  getRequirementByNumber,
  formatRequirementAsMessage,
  listSystemSettings,
  getEstimate,
  getProject,
  listRoles,
  listCostRates,
  listRequirementAttachments,
  type RoleDTO,
} from "@/lib/api-client";
import {
  ESTIMATION_PARAMETER_KEYS,
  ESTIMATION_PARAMETER_LABELS,
  ESTIMATION_PARAMETER_FALLBACKS,
  ESTIMATION_PARAMETER_PERCENT_KEYS,
  ESTIMATION_PARAMETER_VALUE_EDITABLE_KEYS,
  emptyEstimationParameterForm,
  type EstimationParameterEntry,
  type EstimationParameterKey,
  type EstimationParameters,
} from "@/lib/estimation-parameters";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  estimateId?: string;
}

type ParameterForm = Record<EstimationParameterKey, EstimationParameterEntry>;

function ChatUI() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlConversationId = searchParams.get("c");
  const urlRequirementId = searchParams.get("req");
  const refineFromId = searchParams.get("refineFrom");

  const [conversationId, setConversationId] = useState<string | null>(urlConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(!!urlConversationId);
  const [error, setError] = useState<string | null>(null);
  const [reqNumberInput, setReqNumberInput] = useState("");
  const [reqNumberError, setReqNumberError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Panel de parámetros de estimación: se muestra ANTES de arrancar la conversación (spec pedido
  // por usuario). Si ya venimos de una conversación existente (?c=) no hay nada que decidir —
  // los parámetros de esa conversación ya quedaron fijados cuando se creó.
  const [paramsConfirmed, setParamsConfirmed] = useState(!!urlConversationId);
  const [paramsLoading, setParamsLoading] = useState(!urlConversationId);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [paramForm, setParamForm] = useState<ParameterForm>(emptyEstimationParameterForm());
  // Roles a incluir en el desglose de esta estimación (spec pedido por usuario, junto a los
  // parámetros) — arrancan TODOS marcados (comportamiento actual, sin filtrar) salvo que se
  // esté refinando una estimación anterior que haya excluido alguno.
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  // % de asignación configurado por rol (0-1) — solo informativo acá, para que el usuario sepa
  // que un rol incluido no siempre se estima como dedicación 100% (spec pedido por usuario).
  const [allocationPctByRole, setAllocationPctByRole] = useState<Record<string, number>>({});
  const [includedRoleIds, setIncludedRoleIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  // Al refinar, si la estimación anterior tiene el proyecto con su descripción original, se
  // precarga como punto de partida del chat (mejora natural del refinamiento, no bloqueante).
  const [prefillText, setPrefillText] = useState<string | null>(null);

  // Al entrar con ?c=<id> en la URL (recarga de página, o volver más tarde), recuperar el
  // historial completo — antes esto se perdía por completo al refrescar (era el bug reportado).
  useEffect(() => {
    if (!urlConversationId) return;
    getConversation(urlConversationId)
      .then(({ messages: history, estimateIds }) => {
        const lastEstimateId = estimateIds[0];
        const restored: ChatMessage[] = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m, i, arr) => ({
            role: m.role as "user" | "assistant",
            text: m.content ?? "",
            // El último mensaje assistant con texto es donde mostramos el link, si hay una estimación.
            estimateId: m.role === "assistant" && i === arr.length - 1 ? lastEstimateId : undefined,
          }))
          .filter((m) => m.text.trim().length > 0);
        setMessages(restored);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar la conversación"))
      .finally(() => setLoadingHistory(false));
  }, [urlConversationId]);

  // Carga los valores iniciales del panel de parámetros: desde la estimación anterior si viene
  // ?refineFrom=<id> (spec: refinamiento precarga los parámetros usados la última vez), o desde
  // los defaults globales vigentes en cualquier otro caso (nueva estimación, con o sin ?req=).
  useEffect(() => {
    if (urlConversationId) return; // ya hay conversación arrancada, no hay panel que mostrar
    let cancelled = false;
    setParamsLoading(true);
    setParamsError(null);
    (async () => {
      try {
        const [allRoles, costRates] = await Promise.all([listRoles(), listCostRates()]);
        if (!cancelled) {
          setRoles(allRoles);
          setAllocationPctByRole(Object.fromEntries(costRates.map((r) => [r.role_id, Number(r.allocation_pct)])));
        }

        if (refineFromId) {
          const { estimate } = await getEstimate(refineFromId);
          const source = (estimate.parameters as EstimationParameters | null | undefined) ?? null;
          const base = emptyEstimationParameterForm();
          const form: ParameterForm = { ...base };
          for (const key of ESTIMATION_PARAMETER_KEYS) {
            const entry = source?.[key];
            if (entry) form[key] = { included: entry.included, value: entry.value };
          }
          if (!cancelled) setParamForm(form);

          // Roles usados la vez anterior — si la estimación es de antes de esta funcionalidad
          // (included_role_ids null), se asume que no se filtró ningún rol: todos marcados.
          const previousRoleIds = estimate.included_role_ids as string[] | null | undefined;
          if (!cancelled) setIncludedRoleIds(new Set(previousRoleIds && previousRoleIds.length > 0 ? previousRoleIds : allRoles.map((r) => r.id)));

          // % de asignación editado la vez anterior — pisa el % global para los roles que se
          // hayan tocado (spec pedido por usuario: editable y guardado en la estimación).
          const previousAllocationOverrides = estimate.role_allocation_overrides as Record<string, number> | null | undefined;
          if (previousAllocationOverrides && !cancelled) {
            setAllocationPctByRole((prev) => ({ ...prev, ...previousAllocationOverrides }));
          }

          const projectId = estimate.project_id as string | null | undefined;
          if (projectId) {
            try {
              const project = await getProject(projectId);
              if (!cancelled) setPrefillText(project.description ?? null);
            } catch {
              // No bloquea el refinamiento si no se puede recuperar la descripción original.
            }
          }
        } else {
          const settings = await listSystemSettings();
          const byKey = new Map(settings.map((s) => [s.key, s.value]));
          const form = emptyEstimationParameterForm();
          for (const key of ESTIMATION_PARAMETER_KEYS) {
            const raw = byKey.get(key);
            // Por defecto seleccionados (included:true) en una estimación nueva — el usuario ve
            // los 5 parámetros ya marcados con el valor global vigente, y puede desmarcar/editar
            // el que no quiera aplicar (a pedido explícito del usuario).
            form[key] = { included: true, value: typeof raw === "number" ? raw : ESTIMATION_PARAMETER_FALLBACKS[key] };
          }
          if (!cancelled) setParamForm(form);
          if (!cancelled) setIncludedRoleIds(new Set(allRoles.map((r) => r.id))); // todos incluidos por defecto, sin filtrar
        }
      } catch (err) {
        if (!cancelled) setParamsError(err instanceof Error ? err.message : "No se pudieron cargar los parámetros de estimación");
      } finally {
        if (!cancelled) setParamsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlConversationId, refineFromId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const conv = await createConversation("Nueva estimación");
    setConversationId(conv.id);
    router.replace(`/estimate/new?c=${conv.id}`);
    return conv.id;
  }

  // Confirma el panel de parámetros y recién ahí arranca el ciclo de estimación — spec: los
  // parámetros se presentan y se fijan ANTES de empezar la conversación, no durante.
  async function handleConfirmParams() {
    setConfirming(true);
    setError(null);
    try {
      const parameters: EstimationParameters = paramForm;
      const roleIds = Array.from(includedRoleIds);
      if (urlRequirementId) {
        const conv = await createConversation("Estimación desde requerimiento", urlRequirementId, parameters, roleIds, allocationPctByRole);
        setConversationId(conv.id);
        setParamsConfirmed(true);
        router.replace(`/estimate/new?c=${conv.id}`);

        const [requirement, attachments] = await Promise.all([getRequirement(urlRequirementId), listRequirementAttachments(urlRequirementId)]);
        const text = formatRequirementAsMessage(requirement, attachments);
        setMessages([{ role: "user", text }]);
        setSending(true);
        const result = await sendMessage(conv.id, text);
        setMessages((prev) => [...prev, { role: "assistant", text: result.assistantText, estimateId: result.estimateId }]);
        setSending(false);
      } else {
        const title = refineFromId ? "Refinamiento de estimación" : "Nueva estimación";
        const conv = await createConversation(title, undefined, parameters, roleIds, allocationPctByRole);
        setConversationId(conv.id);
        setParamsConfirmed(true);
        router.replace(`/estimate/new?c=${conv.id}`);
        if (prefillText) setInput(prefillText);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la estimación");
      setSending(false);
    } finally {
      setConfirming(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);
    try {
      const convId = await ensureConversation();
      const result = await sendMessage(convId, text);
      setMessages((prev) => [...prev, { role: "assistant", text: result.assistantText, estimateId: result.estimateId }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    } finally {
      setSending(false);
    }
  }

  async function handleLoadByNumber(e: React.FormEvent) {
    e.preventDefault();
    setReqNumberError(null);
    const number = reqNumberInput.trim().replace(/^REQ-/i, "");
    if (!number) return;
    try {
      const requirement = await getRequirementByNumber(number);
      router.push(`/estimate/new?req=${requirement.id}`);
    } catch (err) {
      setReqNumberError(err instanceof Error ? err.message : "No se encontró ese requerimiento");
    }
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setParamsConfirmed(false);
    setPrefillText(null);
    setInput("");
    router.replace("/estimate/new");
  }

  function updateParam(key: EstimationParameterKey, patch: Partial<EstimationParameterEntry>) {
    setParamForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));
  }

  function toggleRole(roleId: string) {
    setIncludedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  return (
    <div className="flex h-[calc(100vh-160px)] flex-col">
      <PageHeader
        icon={Sparkles}
        title="Nueva estimación"
        subtitle="Conversa con el agente — busca evidencia real antes de darte un número."
        actions={
          conversationId && (
            <button onClick={startNewConversation} className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Empezar otra conversación
            </button>
          )
        }
      />

      {!paramsConfirmed ? (
        <div className="flex-1 space-y-4 overflow-y-auto">
          <div className={cardPadded}>
            <div className="mb-1 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-brand-600" strokeWidth={2} />
              <h2 className="font-semibold text-slate-900">Parámetros de esta estimación</h2>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {refineFromId
                ? "Estos son los parámetros usados en la estimación anterior. Ajusta lo que necesites y continúa el ciclo."
                : "Marca los que quieras personalizar solo para esta estimación, con el valor que quieras usar. Si no marcas ninguno, se usa la configuración estándar del sistema, sin cambios."}
            </p>
            {paramsLoading ? (
              <p className="text-sm text-slate-400">Cargando parámetros…</p>
            ) : (
              <>
                <div className="space-y-3">
                  {ESTIMATION_PARAMETER_KEYS.map((key) => {
                    const isPercent = ESTIMATION_PARAMETER_PERCENT_KEYS.has(key);
                    // Solo Contingencia y Overhead se pueden editar por-estimación (spec pedido por
                    // usuario) — el resto queda siempre aplicado con el valor global, sin poder tocarlo.
                    const isValueEditable = ESTIMATION_PARAMETER_VALUE_EDITABLE_KEYS.has(key);
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={paramForm[key].included}
                          // En una estimación NUEVA los 5 van siempre marcados y no se pueden
                          // desmarcar (spec pedido por usuario). En refinamiento sigue editable,
                          // como antes — precarga lo que quedó la vez anterior, ajustable.
                          disabled={!refineFromId}
                          onChange={refineFromId ? (e) => updateParam(key, { included: e.target.checked }) : undefined}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-70"
                        />
                        <label className="w-80 shrink-0 text-sm text-slate-600">{ESTIMATION_PARAMETER_LABELS[key]}</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={isPercent ? paramForm[key].value * 100 : paramForm[key].value}
                            disabled={!paramForm[key].included || !isValueEditable}
                            onChange={(e) => updateParam(key, { value: isPercent ? Number(e.target.value) / 100 : Number(e.target.value) })}
                            className={`${inputClass} max-w-[140px] disabled:bg-slate-50 disabled:text-slate-400 ${isPercent ? "pr-7" : ""}`}
                          />
                          {isPercent && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="mb-1 text-sm font-medium text-slate-700">Roles a incluir en el desglose</h3>
                  <p className="mb-3 text-xs text-slate-400">
                    Desmarca los roles que no quieras que aparezcan en el esfuerzo por fase y rol de esta estimación. Si no desmarcas ninguno, se
                    incluyen todos (comportamiento estándar). El % junto a cada rol es su asignación al proyecto — no siempre es 100%, se considera
                    en el cálculo de tiempo y costo, y puedes editarlo solo para esta estimación.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {roles.map((role) => (
                      <div key={role.id} className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={includedRoleIds.has(role.id)}
                          onChange={() => toggleRole(role.id)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                        />
                        <span className="flex-1">{role.name}</span>
                        <div className="relative shrink-0">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            step="any"
                            value={Math.round((allocationPctByRole[role.id] ?? 1) * 100)}
                            onChange={(e) => {
                              const pct = Math.min(1, Math.max(0.01, Number(e.target.value) / 100));
                              setAllocationPctByRole((prev) => ({ ...prev, [role.id]: pct }));
                            }}
                            className={`${inputClass} w-16 pr-5 text-xs`}
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {paramsError && <p className="mt-3 text-sm text-red-600">{paramsError}</p>}
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-4 flex justify-end">
                  <button onClick={handleConfirmParams} disabled={confirming} className={btnPrimary}>
                    {confirming ? "Iniciando…" : refineFromId ? "Continuar con estos parámetros" : "Iniciar estimación"}
                  </button>
                </div>
              </>
            )}
          </div>

          {!urlRequirementId && !refineFromId && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>¿Vas a estimar un requerimiento ya cargado?</span>
              <form onSubmit={handleLoadByNumber} className="flex items-center gap-2">
                <div className="relative">
                  <Hash className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                  <input
                    value={reqNumberInput}
                    onChange={(e) => setReqNumberInput(e.target.value)}
                    placeholder="Número de requerimiento"
                    className={`${inputClass} w-44 pl-7 text-sm`}
                  />
                </div>
                <button type="submit" className={btnSecondary}>
                  Cargar
                </button>
              </form>
              {reqNumberError && <span className="text-xs text-red-600">{reqNumberError}</span>}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-inner">
            {loadingHistory && messages.length === 0 && <p className="text-sm text-slate-400">Cargando conversación…</p>}
            {!loadingHistory && messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-100">
                  <Sparkles className="h-6 w-6 text-accent-600" strokeWidth={2} />
                </div>
                <p className="max-w-sm text-sm text-slate-400">
                  Describe el requerimiento del proyecto (mientras más detalle, mejor referencia histórica encontraré). Ejemplo:
                  &ldquo;Necesitamos una app web para gestionar solicitudes de compra, integrada con nuestro ERP, con 5 tipos de
                  usuario&rdquo;.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user" ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-500 px-4 py-2 text-white shadow-sm" : "max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm"}>
                  {m.role === "user" ? (
                    <p className="whitespace-pre-line text-sm">{m.text}</p>
                  ) : (
                    <>
                      <div className="prose-report text-sm">
                        <ReactMarkdown>{m.text}</ReactMarkdown>
                      </div>
                      {m.estimateId && (
                        <Link href={`/estimate/${m.estimateId}`} className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline">
                          Ver estimación completa →
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-500" strokeWidth={2.5} />
                  Analizando… esto puede tardar hasta un minuto (busca referencias, estima, calcula costos).
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="mt-3 flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Escribe tu requerimiento o respuesta…"
              className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="flex items-center gap-1.5 self-end rounded-full bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              <Send className="h-4 w-4" strokeWidth={2} />
              Enviar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function NewEstimatePage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="py-16 text-center text-slate-400">Cargando…</div>}>
        <ChatUI />
      </Suspense>
    </RequireAuth>
  );
}
