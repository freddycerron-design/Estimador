"use client";

import { useEffect, useState } from "react";
import { Brain, RefreshCw, Check, Zap } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { PageHeader } from "@/components/page-header";
import { btnPrimary, btnSecondary, cardPadded } from "@/lib/ui-classes";
import { listProposals, runLearningCycle, approveProposal, activateProposal, type LearningProposalDTO } from "@/lib/api-client";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300",
  EVALUATION: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  ACTIVE: "bg-brand-500 text-white",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

function ProposalCard({ proposal, onChange }: { proposal: LearningProposalDTO; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const summary = proposal.evaluation_summary as any;

  async function handleApprove() {
    setBusy(true);
    try {
      await approveProposal(proposal.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function handleActivate() {
    setBusy(true);
    try {
      await activateProposal(proposal.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cardPadded}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{proposal.title}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[proposal.status] ?? "bg-slate-100 dark:bg-navy-700"}`}>
          {proposal.status}
        </span>
      </div>
      {proposal.description && <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{proposal.description}</p>}
      {proposal.rationale && <p className="mb-2 text-sm italic text-slate-500 dark:text-slate-400">&ldquo;{proposal.rationale}&rdquo;</p>}
      {summary && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-navy-900/40 dark:text-slate-400">
          Evaluación: {summary.casesRun} caso(s) · error base {summary.baselineAvgErrorPct}% → error ajustado {summary.adjustedAvgErrorPct}% (
          {summary.improvementPct >= 0 ? "+" : ""}
          {summary.improvementPct}pp de mejora) — {summary.passed ? "respaldado por evidencia" : "sin evidencia suficiente"}
        </p>
      )}
      <div className="flex gap-2">
        {proposal.status === "PENDING_APPROVAL" && (
          <button onClick={handleApprove} disabled={busy} className={`${btnPrimary} !px-3 !py-1.5 text-xs`}>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Aprobar
          </button>
        )}
        {proposal.status === "APPROVED" && (
          <button onClick={handleActivate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50">
            <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
            Activar
          </button>
        )}
      </div>
    </div>
  );
}

function ProposalsList() {
  const [proposals, setProposals] = useState<LearningProposalDTO[]>([]);
  const [running, setRunning] = useState(false);

  function reload() {
    listProposals().then(setProposals);
  }
  useEffect(reload, []);

  async function handleRun() {
    setRunning(true);
    try {
      await runLearningCycle();
      reload();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <PageHeader
        icon={Brain}
        title="Propuestas de aprendizaje"
        subtitle="El Learning Agent detecta patrones de desviación y propone ajustes — ninguno se activa sin aprobación humana."
        actions={
          <button onClick={handleRun} disabled={running} className={btnSecondary}>
            <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} strokeWidth={2} />
            {running ? "Analizando…" : "Correr ciclo de aprendizaje"}
          </button>
        }
      />
      <div className="space-y-3">
        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} onChange={reload} />
        ))}
        {proposals.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Sin propuestas todavía. Corre el ciclo de aprendizaje para generar.</p>
        )}
      </div>
    </div>
  );
}

export default function LearningProposalsPage() {
  return (
    <RequireAuth>
      <ProposalsList />
    </RequireAuth>
  );
}
