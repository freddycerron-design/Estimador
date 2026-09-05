"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, Send, Plus, SlidersHorizontal, Loader2, FileText, X, ChevronUp, ChevronDown } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { createChatMarkdownComponents } from "@/components/chat-markdown";
import { btnPrimary, btnSecondary, cardPadded, input as inputClass } from "@/lib/ui-classes";
import {
  createConversation,
  sendMessage,
  getConversation,
  getRequirement,
  formatRequirementAsMessage,
  listSystemSettings,
  getEstimate,
  getProject,
  listRoles,
  listCostRates,
  listRequirementAttachments,
  type RoleDTO,
  type RequirementDTO,
  type RequirementAttachmentDTO,
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

// Resumen de lo que efectivamente se le envía al agente como primer input cuando la estimación
// arranca desde un requerimiento cargado (spec pedido por usuario: mostrar título, descripción, y
// dejar explícito que se considera TODA la información del requerimiento + adjuntos) — se muestra
// como una tarjeta aparte, no como el mensaje de chat en sí (que sigue llevando el texto completo,
// incluido el contenido de los adjuntos, para que el agente lo lea).
interface RequirementContextInfo {
  title: string;
  description: string;
  detailsLine: string | null;
  attachments: { filename: string; ok: boolean }[];
}

function buildRequirementContext(r: RequirementDTO, attachments: RequirementAttachmentDTO[]): RequirementContextInfo {
  const details: string[] = [];
  if (r.project_type) details.push(`Tipo de proyecto: ${r.project_type}`);
  if (r.industry) details.push(`Industria: ${r.industry}`);
  if (r.technologies.length) details.push(`Tecnologías: ${r.technologies.join(", ")}`);
  if (r.modules.length) details.push(`Módulos: ${r.modules.join(", ")}`);
  if (r.integrations.length) details.push(`Integraciones: ${r.integrations.join(", ")}`);
  if (r.num_users !== null && r.num_users !== undefined) details.push(`Usuarios: ${r.num_users}`);
  if (r.num_interfaces !== null && r.num_interfaces !== undefined) details.push(`Interfaces: ${r.num_interfaces}`);
  if (r.complexity) details.push(`Complejidad: ${r.complexity}`);
  return {
    title: r.title,
    description: r.description,
    detailsLine: details.length > 0 ? details.join(" · ") : null,
    attachments: attachments.map((a) => ({ filename: a.filename, ok: a.extraction_status === "ok" })),
  };
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

const CANCELLED_NOTICE =
  "_Se canceló la espera de esta respuesta. El agente puede seguir procesando del lado del servidor — si termina, el resultado quedará guardado en el historial de esta conversación aunque no lo veas acá._";

// Parámetros cuyo campo de % reemplaza la flecha nativa del navegador por flechas propias en
// color de marca (spec pedido por usuario) — el resto conserva la flecha nativa.
const CUSTOM_ARROW_KEYS = new Set<EstimationParameterKey>(["DEFAULT_CONTINGENCY_PCT", "DEFAULT_OVERHEAD_PCT"]);

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
  // Info del requerimiento que se está considerando como input de esta estimación (spec pedido
  // por usuario) — null si esta conversación no vino de un requerimiento cargado.
  const [requirementContext, setRequirementContext] = useState<RequirementContextInfo | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Permite cancelar la ESPERA de la respuesta en curso (spec pedido por usuario) — ver botón
  // "Cancelar" junto al indicador de "Analizando…".
  const sendAbortRef = useRef<AbortController | null>(null);
  // Referencia al textarea de respuesta — al hacer clic en una opción clickeable de una pregunta
  // numerada (spec pedido por usuario), se agrega al input y se enfoca acá para que el usuario
  // pueda seguir completando su respuesta antes de enviar.
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      .then(async ({ conversation, messages: history, estimateIds }) => {
        const lastEstimateId = estimateIds[0];

        // Si esta conversación arrancó desde un requerimiento, reconstruir la misma tarjeta de
        // contexto que se muestra al iniciarla — y quitar del historial visible el primer mensaje
        // user (el volcado completo título+descripción+adjuntos), que esa tarjeta reemplaza.
        let history_ = history;
        if (conversation.requirement_id) {
          const firstUserIdx = history_.findIndex((m) => m.role === "user");
          if (firstUserIdx !== -1) history_ = history_.filter((_, i) => i !== firstUserIdx);
          try {
            const [requirement, attachments] = await Promise.all([
              getRequirement(conversation.requirement_id),
              listRequirementAttachments(conversation.requirement_id),
            ]);
            setRequirementContext(buildRequirementContext(requirement, attachments));
          } catch {
            // Si el requerimiento ya no existe (borrado, etc.) no bloquea ver el resto del historial.
          }
        }

        const restored: ChatMessage[] = history_
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
        // El agente sigue recibiendo el texto completo (título+descripción+campos+adjuntos) — la
        // tarjeta de contexto es solo la vista compacta que se le muestra al usuario (spec pedido
        // por usuario: mostrar qué se está considerando, sin volcar el contenido crudo al chat).
        const fullText = formatRequirementAsMessage(requirement, attachments);
        setRequirementContext(buildRequirementContext(requirement, attachments));
        setMessages([]);
        setSending(true);
        const controller = new AbortController();
        sendAbortRef.current = controller;
        try {
          const result = await sendMessage(conv.id, fullText, controller.signal);
          setMessages((prev) => [...prev, { role: "assistant", text: result.assistantText, estimateId: result.estimateId }]);
        } catch (err) {
          if (isAbortError(err)) {
            setMessages((prev) => [...prev, { role: "assistant", text: CANCELLED_NOTICE }]);
          } else {
            throw err;
          }
        } finally {
          setSending(false);
          sendAbortRef.current = null;
        }
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
    const controller = new AbortController();
    sendAbortRef.current = controller;
    try {
      const convId = await ensureConversation();
      const result = await sendMessage(convId, text, controller.signal);
      setMessages((prev) => [...prev, { role: "assistant", text: result.assistantText, estimateId: result.estimateId }]);
    } catch (err) {
      if (isAbortError(err)) {
        setMessages((prev) => [...prev, { role: "assistant", text: CANCELLED_NOTICE }]);
      } else {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    } finally {
      setSending(false);
      sendAbortRef.current = null;
    }
  }

  // Cancela la ESPERA de la respuesta en curso (spec pedido por usuario) — el fetch se aborta en
  // el navegador; el turno del agente puede seguir corriendo del lado del servidor hasta terminar.
  function handleCancel() {
    sendAbortRef.current?.abort();
  }

  // Cancela todo el proceso de estimación en curso (spec pedido por usuario, distinto del botón
  // de arriba: ese solo deja de esperar la respuesta actual, este abandona la conversación
  // completa). Deja de esperar cualquier respuesta pendiente y saca al usuario del flujo — no hay
  // forma de marcar la conversación como abandonada en el backend, así que esto es solo del lado
  // del cliente, igual que la cancelación de espera.
  function handleCancelEstimation() {
    if (!confirm("¿Cancelar esta estimación? Se perderá el progreso de esta conversación.")) return;
    sendAbortRef.current?.abort();
    router.push("/estimates");
  }

  // Agrega texto al input de respuesta (sin pisar lo que el usuario ya haya escrito, por si está
  // respondiendo varias preguntas numeradas antes de enviar) y deja el cursor listo para seguir
  // escribiendo — usado por las opciones clickeables de las preguntas numeradas.
  function appendAnswerToInput(text: string) {
    setInput((prev) => (prev.trim().length > 0 ? `${prev.replace(/\s+$/, "")}\n${text}` : text));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  // Click en una opción de una pregunta numerada (spec pedido por usuario) — antepone el número de
  // la pregunta para que quede claro a cuál responde, incluso si se completan varias antes de
  // enviar. "Otros" no inserta un valor: deja el número listo para que el usuario escriba el suyo.
  function handleOptionClick(questionNumber: number, optionText: string, isOther: boolean) {
    appendAnswerToInput(isOther ? `${questionNumber}. ` : `${questionNumber}. ${optionText}`);
  }
  const chatMarkdownComponents = useMemo(() => createChatMarkdownComponents(handleOptionClick), []); // eslint-disable-line react-hooks/exhaustive-deps

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setRequirementContext(null);
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

  // Suma/resta 1 punto porcentual al % de asignación de un rol — usado por las flechas propias
  // que reemplazan las nativas del navegador (spec pedido por usuario: más chicas y con color de
  // marca, ya que la flecha nativa no se puede recolorear vía CSS).
  function stepAllocationPct(roleId: string, deltaPct: number) {
    setAllocationPctByRole((prev) => {
      const currentPct = Math.round((prev[roleId] ?? 1) * 100);
      const next = Math.min(100, Math.max(1, currentPct + deltaPct));
      return { ...prev, [roleId]: next / 100 };
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
            <button onClick={startNewConversation} className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400">
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
              <SlidersHorizontal className="h-4 w-4 text-brand-600 dark:text-brand-400" strokeWidth={2} />
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Parámetros de esta estimación</h2>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {refineFromId
                ? "Estos son los parámetros usados en la estimación anterior. Ajusta lo que necesites y continúa el ciclo."
                : "Para la estimación, solo los valores de Contingencia por defecto y Overhead por defecto son editables, los otros valores son obligatorios."}
            </p>
            {paramsLoading ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Cargando parámetros…</p>
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
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-70 dark:border-navy-600 dark:bg-navy-800"
                        />
                        <label className="w-80 shrink-0 text-sm text-slate-600 dark:text-slate-300">{ESTIMATION_PARAMETER_LABELS[key]}</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={isPercent ? paramForm[key].value * 100 : paramForm[key].value}
                            disabled={!paramForm[key].included || !isValueEditable}
                            onChange={(e) => updateParam(key, { value: isPercent ? Number(e.target.value) / 100 : Number(e.target.value) })}
                            // Flechas nativas ocultas solo para Contingencia y Overhead (spec
                            // pedido por usuario) — se reemplazan por las propias de más abajo,
                            // mismo tamaño de campo, en color de marca. El resto de parámetros
                            // conserva la flecha nativa del navegador.
                            className={`${inputClass} max-w-[140px] disabled:bg-slate-50 disabled:text-slate-400 dark:disabled:bg-navy-900/60 dark:disabled:text-slate-500 ${isPercent ? "pr-7" : ""} ${
                              CUSTOM_ARROW_KEYS.has(key)
                                ? "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                : ""
                            }`}
                          />
                          {isPercent && (
                            <span
                              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500 ${
                                CUSTOM_ARROW_KEYS.has(key) ? "right-6" : "right-2.5"
                              }`}
                            >
                              %
                            </span>
                          )}
                          {CUSTOM_ARROW_KEYS.has(key) && (
                            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 flex-col leading-none">
                              <button
                                type="button"
                                tabIndex={-1}
                                disabled={!paramForm[key].included || !isValueEditable}
                                onClick={() => updateParam(key, { value: Math.min(1, Math.max(0, paramForm[key].value + 0.01)) })}
                                className="text-brand-500 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-30 dark:text-brand-400 dark:hover:text-brand-300"
                                aria-label={`Aumentar ${ESTIMATION_PARAMETER_LABELS[key]}`}
                              >
                                <ChevronUp className="h-2.5 w-2.5" strokeWidth={3} />
                              </button>
                              <button
                                type="button"
                                tabIndex={-1}
                                disabled={!paramForm[key].included || !isValueEditable}
                                onClick={() => updateParam(key, { value: Math.min(1, Math.max(0, paramForm[key].value - 0.01)) })}
                                className="text-brand-500 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-30 dark:text-brand-400 dark:hover:text-brand-300"
                                aria-label={`Disminuir ${ESTIMATION_PARAMETER_LABELS[key]}`}
                              >
                                <ChevronDown className="h-2.5 w-2.5" strokeWidth={3} />
                              </button>
                            </div>
                          )}
                        </div>
                        {key === "DEFAULT_CONTINGENCY_PCT" && (
                          <span className="flex-1 text-xs text-slate-500 dark:text-slate-400">
                            Contingencia (15% por defecto): Es un colchón de riesgo — margen para imprevistos, cambios de alcance, o error de
                            estimación. Es la reserva por si algo sale distinto a lo planeado, no un costo operativo fijo.
                          </span>
                        )}
                        {key === "DEFAULT_OVERHEAD_PCT" && (
                          <span className="flex-1 text-xs text-slate-500 dark:text-slate-400">
                            Overhead (10% por defecto): Costos indirectos de operar el proyecto — gestión, coordinación, tiempo no facturable,
                            herramientas — todo lo que rodea la ejecución pero no es horas de trabajo directo sobre el entregable.
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-navy-700">
                  <h3 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Roles a incluir en el desglose</h3>
                  <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
                    Desmarca los roles que no quieras que aparezcan en el esfuerzo por fase y rol de esta estimación. Si no desmarcas ninguno, se
                    incluyen todos (comportamiento estándar). El % junto a cada rol es su asignación al proyecto — no siempre es 100%, se considera
                    en el cálculo de tiempo y costo, y puedes editarlo solo para esta estimación.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {roles.map((role) => (
                      <div key={role.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={includedRoleIds.has(role.id)}
                          onChange={() => toggleRole(role.id)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-400 dark:border-navy-600 dark:bg-navy-800"
                        />
                        {/* El nombre estira su espacio disponible (spec pedido por usuario, mismo
                            criterio que antes solo tenía "Project Manager") para que el % de
                            todos los roles quede alineado en el mismo borde derecho. */}
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
                            // Nota: no uso `inputClass` compartido acá porque trae `w-full`, que le
                            // gana al ancho fijo y estira el campo a todo el espacio disponible.
                            // Ancho ampliado (spec pedido por usuario) para que 3 dígitos (100%) +
                            // el "%" + las flechas no queden amontonados. Flechas nativas ocultas
                            // (spec pedido por usuario: reducir tamaño y darles color de marca —
                            // la flecha nativa del navegador no se puede recolorear vía CSS, así
                            // que se reemplaza por las propias de más abajo).
                            className="w-20 rounded-lg border border-slate-300 py-1 pl-2.5 pr-7 text-xs shadow-sm [appearance:textfield] focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <span className="pointer-events-none absolute right-[19px] top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">%</span>
                          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 flex-col leading-none">
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => stepAllocationPct(role.id, 1)}
                              className="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
                              aria-label={`Aumentar % de ${role.name}`}
                            >
                              <ChevronUp className="h-2.5 w-2.5" strokeWidth={3} />
                            </button>
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => stepAllocationPct(role.id, -1)}
                              className="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
                              aria-label={`Disminuir % de ${role.name}`}
                            >
                              <ChevronDown className="h-2.5 w-2.5" strokeWidth={3} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {paramsError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{paramsError}</p>}
                {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
                <div className="mt-4 flex justify-end">
                  <button onClick={handleConfirmParams} disabled={confirming} className={btnPrimary}>
                    {confirming ? "Iniciando…" : refineFromId ? "Continuar con estos parámetros" : "Iniciar estimación"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-inner dark:border-navy-700 dark:bg-navy-900/60">
            {loadingHistory && messages.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">Cargando conversación…</p>}
            {!loadingHistory && messages.length === 0 && !requirementContext && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-100 dark:bg-azure-500/20">
                  <Sparkles className="h-6 w-6 text-accent-600 dark:text-azure-400" strokeWidth={2} />
                </div>
                <p className="max-w-sm text-sm text-slate-400 dark:text-slate-500">
                  Describe el requerimiento del proyecto (mientras más detalle, mejor referencia histórica encontraré). Ejemplo:
                  &ldquo;Necesitamos una app web para gestionar solicitudes de compra, integrada con nuestro ERP, con 5 tipos de
                  usuario&rdquo;.
                </p>
              </div>
            )}
            {requirementContext && (
              <div className="rounded-xl border border-accent-200 bg-accent-50/70 p-4 shadow-sm dark:border-azure-500/30 dark:bg-azure-500/10">
                <div className="mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-accent-600 dark:text-azure-400" strokeWidth={2} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-azure-300">
                    Información considerada para esta estimación
                  </span>
                </div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{requirementContext.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{requirementContext.description}</p>
                {requirementContext.detailsLine && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{requirementContext.detailsLine}</p>
                )}
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Se está considerando toda la información registrada de este requerimiento
                  {requirementContext.attachments.length > 0 && (
                    <>
                      {" "}
                      y el contenido de {requirementContext.attachments.length} archivo{requirementContext.attachments.length > 1 ? "s" : ""} adjunto
                      {requirementContext.attachments.length > 1 ? "s" : ""}: {requirementContext.attachments.map((a) => a.filename).join(", ")}
                    </>
                  )}
                  .
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-500 px-4 py-2 text-white shadow-sm"
                      // Ancho completo (spec pedido por usuario) para que el bloque de resultado quede
                      // alineado con la tarjeta de "información considerada" — ambos ocupan el mismo
                      // ancho dentro del contenedor del chat, en vez del 90% angosto anterior.
                      : "w-full rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm dark:bg-navy-800"
                  }
                >
                  {m.role === "user" ? (
                    <p className="whitespace-pre-line text-sm">{m.text}</p>
                  ) : (
                    <>
                      <div className="prose-report text-sm dark:text-slate-200">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents}>
                          {m.text}
                        </ReactMarkdown>
                      </div>
                      {m.estimateId && (
                        <Link
                          href={`/estimate/${m.estimateId}`}
                          className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
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
                <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:bg-navy-800 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-500 dark:text-azure-400" strokeWidth={2.5} />
                  Analizando… esto puede tardar hasta un minuto (busca referencias, estima, calcula costos).
                  <button
                    onClick={handleCancel}
                    className="ml-1 flex shrink-0 items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700"
                    title="Deja de esperar la respuesta — el agente puede seguir procesando en el servidor"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="mt-3 flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={5}
              placeholder="Escribe tu requerimiento o respuesta…"
              className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <div className="flex flex-col justify-end gap-2">
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="flex items-center justify-center gap-1.5 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                <Send className="h-4 w-4" strokeWidth={2} />
                Enviar
              </button>
              <button
                onClick={handleCancelEstimation}
                className="flex items-center justify-center gap-1.5 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700"
                title="Abandona esta estimación por completo y vuelve al listado"
              >
                <X className="h-4 w-4" strokeWidth={2} />
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function NewEstimatePage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="py-16 text-center text-slate-400 dark:text-slate-500">Cargando…</div>}>
        <ChatUI />
      </Suspense>
    </RequireAuth>
  );
}
