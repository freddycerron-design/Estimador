"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send, Plus, Hash, SlidersHorizontal } from "lucide-react";
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
} from "@/lib/api-client";
import {
  ESTIMATION_PARAMETER_KEYS,
  ESTIMATION_PARAMETER_LABELS,
  ESTIMATION_PARAMETER_FALLBACKS,
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
            // el que no quiera aplicar. En refinamiento no se toca este default (arriba precarga
            // tal como quedó marcado en la estimación anterior, eso sigue igual).
            form[key] = { included: true, value: typeof raw === "number" ? raw : ESTIMATION_PARAMETER_FALLBACKS[key] };
          }
          if (!cancelled) setParamForm(form);
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
      if (urlRequirementId) {
        const conv = await createConversation("Estimación desde requerimiento", urlRequirementId, parameters);
        setConversationId(conv.id);
        setParamsConfirmed(true);
        router.replace(`/estimate/new?c=${conv.id}`);

        const requirement = await getRequirement(urlRequirementId);
        const text = formatRequirementAsMessage(requirement);
        setMessages([{ role: "user", text }]);
        setSending(true);
        const result = await sendMessage(conv.id, text);
        setMessages((prev) => [...prev, { role: "assistant", text: result.assistantText, estimateId: result.estimateId }]);
        setSending(false);
      } else {
        const title = refineFromId ? "Refinamiento de estimación" : "Nueva estimación";
        const conv = await createConversation(title, undefined, parameters);
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
                  {ESTIMATION_PARAMETER_KEYS.map((key) => (
                    <div key={key} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={paramForm[key].included}
                        onChange={(e) => updateParam(key, { included: e.target.checked })}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                      />
                      <label className="w-80 shrink-0 text-sm text-slate-600">{ESTIMATION_PARAMETER_LABELS[key]}</label>
                      <input
                        type="number"
                        step="any"
                        value={paramForm[key].value}
                        disabled={!paramForm[key].included}
                        onChange={(e) => updateParam(key, { value: Number(e.target.value) })}
                        className={`${inputClass} max-w-[140px] disabled:bg-slate-50 disabled:text-slate-400`}
                      />
                    </div>
                  ))}
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
          <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                <div className={m.role === "user" ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-500 px-4 py-2 text-white shadow-sm" : "max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3"}>
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
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400" />
                  </span>
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
