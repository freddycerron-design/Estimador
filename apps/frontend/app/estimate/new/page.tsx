"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send, Plus, Hash } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { btnSecondary, input as inputClass } from "@/lib/ui-classes";
import { createConversation, sendMessage, getConversation, getRequirement, getRequirementByNumber, formatRequirementAsMessage } from "@/lib/api-client";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  estimateId?: string;
}

function ChatUI() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlConversationId = searchParams.get("c");
  const urlRequirementId = searchParams.get("req");

  const [conversationId, setConversationId] = useState<string | null>(urlConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(!!urlConversationId);
  const [startingFromRequirement, setStartingFromRequirement] = useState(!!urlRequirementId && !urlConversationId);
  const [error, setError] = useState<string | null>(null);
  const [reqNumberInput, setReqNumberInput] = useState("");
  const [reqNumberError, setReqNumberError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  // Entrada alterna: ?req=<requirementId> (desde "Requerimientos" → seleccionar → Estimar) —
  // carga el requerimiento, arma el mensaje inicial con toda su info, y arranca la
  // conversación automáticamente, ligada al requirement (spec pedido por usuario).
  useEffect(() => {
    if (!urlRequirementId || urlConversationId) return;
    let cancelled = false;
    (async () => {
      try {
        const conv = await createConversation("Estimación desde requerimiento", urlRequirementId);
        if (cancelled) return;
        setConversationId(conv.id);
        router.replace(`/estimate/new?c=${conv.id}`);

        const requirement = await getRequirement(urlRequirementId);
        const text = formatRequirementAsMessage(requirement);
        setMessages([{ role: "user", text }]);
        setSending(true);
        const result = await sendMessage(conv.id, text);
        if (cancelled) return;
        setMessages((prev) => [...prev, { role: "assistant", text: result.assistantText, estimateId: result.estimateId }]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo iniciar la estimación desde el requerimiento");
      } finally {
        if (!cancelled) {
          setSending(false);
          setStartingFromRequirement(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRequirementId]);

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
    router.replace("/estimate/new");
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

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {(loadingHistory || startingFromRequirement) && messages.length === 0 && (
          <p className="text-sm text-slate-400">{startingFromRequirement ? "Cargando requerimiento…" : "Cargando conversación…"}</p>
        )}
        {!loadingHistory && !startingFromRequirement && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-100">
              <Sparkles className="h-6 w-6 text-accent-600" strokeWidth={2} />
            </div>
            <p className="max-w-sm text-sm text-slate-400">
              Describe el requerimiento del proyecto (mientras más detalle, mejor referencia histórica encontraré). Ejemplo:
              &ldquo;Necesitamos una app web para gestionar solicitudes de compra, integrada con nuestro ERP, con 5 tipos de
              usuario&rdquo;.
            </p>
            <form onSubmit={handleLoadByNumber} className="mt-4 flex items-center gap-2">
              <span className="text-sm text-slate-400">o</span>
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
            {reqNumberError && <p className="mt-2 text-xs text-red-600">{reqNumberError}</p>}
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
