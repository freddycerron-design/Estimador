"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, FolderKanban, Brain, ClipboardList } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { getHomeSummary, type HomeSummaryDTO } from "@/lib/api-client";
import { card, cardPadded, badgeAccent, badgeBlue, badgeBrandText } from "@/lib/ui-classes";

// Mismo patrón de tile ya usado para Duración/Costo/Confianza en estimate/[id]/page.tsx —
// etiqueta chica en mayúsculas + número grande.
const KPIS: { key: keyof HomeSummaryDTO; label: string }[] = [
  { key: "pendingRequirements", label: "Requerimientos pendientes de estimar" },
  { key: "totalEstimates", label: "Total de estimaciones" },
  { key: "totalProjects", label: "Total de proyectos históricos" },
];

// 2 acentos para el ícono/badge/tagline de cada tarjeta (spec pedido por usuario: Requerimientos
// y Proyectos pasan de naranja a azul, igual que Estimaciones — solo Aprendizaje, la única
// impulsada por IA que queda tras quitar "Nueva estimación", se mantiene en violeta/azure).
// El naranja de marca queda reservado para el texto de los tags de abajo, siempre igual en las
// 4 tarjetas sin importar su acento — ver `badgeBrandText` en ui-classes.ts.
const ACCENTS = {
  accent: {
    tile: "bg-accent-100 dark:bg-azure-500/20",
    icon: "text-accent-600 dark:text-azure-400",
    badge: badgeAccent,
    tagline: "text-accent-600 dark:text-azure-400",
  },
  blue: {
    tile: "bg-blue-100 dark:bg-azure-500/20",
    icon: "text-blue-600 dark:text-azure-400",
    badge: badgeBlue,
    tagline: "text-blue-600 dark:text-azure-400",
  },
} as const;

const CARDS = [
  {
    href: "/requirements",
    icon: ClipboardList,
    accent: "blue",
    badge: "Catálogo",
    title: "Requerimientos",
    tagline: "De la idea al detalle accionable",
    description: "Requerimientos cargados con sus archivos adjuntos ya leídos — listos para convertirse en una estimación.",
    label: "Qué incluye",
    tags: ["PDF, Word, PPTX, Excel", "Lectura automática", "Historial completo"],
  },
  {
    href: "/estimates",
    icon: FileText,
    accent: "blue",
    badge: "Resultado",
    title: "Estimaciones",
    tagline: "Un rango, no un número suelto",
    description: "Cualquier estimación generada, con su desglose completo por fase y rol.",
    label: "Qué ves",
    tags: ["Rango + confianza", "Procedencia por dato", "Exporta a Excel/PPTX"],
  },
  {
    href: "/projects",
    icon: FolderKanban,
    accent: "blue",
    badge: "Evidencia",
    title: "Proyectos",
    tagline: "La memoria que hace confiables las estimaciones",
    description: "El histórico real contra el que se compara cada requerimiento nuevo — importable desde Excel/CSV.",
    label: "Qué guarda",
    tags: ["Horas y costos reales", "Import Excel/CSV", "Base de comparación"],
  },
  {
    href: "/learning/proposals",
    icon: Brain,
    accent: "accent",
    badge: "Mejora continua",
    title: "Aprendizaje",
    tagline: "Nada se aplica sin que alguien lo revise",
    description: "Propuestas de ajuste del Learning Agent, pendientes de aprobación humana antes de usarse.",
    label: "Cómo funciona",
    tags: ["Detecta patrones", "Redacta una propuesta", "Requiere aprobación"],
  },
] as const;

export default function HomePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<HomeSummaryDTO | null>(null);

  useEffect(() => {
    getHomeSummary()
      .then(setSummary)
      .catch(() => setSummary(null)); // los KPIs son un extra informativo — si fallan, no bloquean el resto del home.
  }, []);

  return (
    <RequireAuth>
      <div className="py-4">
        <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Hola{user?.name ? `, ${user.name}` : ""} 👋
        </h1>
        <p className="mb-6 text-slate-500 dark:text-slate-400">
          Estimador de proyectos de TI basado en evidencia histórica — no adivina, busca proyectos similares reales y te dice de dónde
          viene cada número.
        </p>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {KPIS.map(({ key, label }) => (
            <div key={key} className={`${cardPadded} text-center`}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {summary ? summary[key] : "—"}
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ href, icon: Icon, accent, badge, title, tagline, description, label, tags }) => {
            const a = ACCENTS[accent];
            return (
              <Link key={href} href={href} className={`${card} flex flex-col gap-4 p-6 transition-shadow hover:shadow-md dark:hover:shadow-black/20`}>
                <div className="flex items-center justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${a.tile}`}>
                    <Icon className={`h-5 w-5 ${a.icon}`} strokeWidth={2} />
                  </div>
                  <span className={a.badge}>{badge}</span>
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                  <p className={`mt-0.5 text-sm font-medium ${a.tagline}`}>{tagline}</p>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
                <div className="mt-auto pt-1">
                  <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span key={t} className={badgeBrandText}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </RequireAuth>
  );
}
