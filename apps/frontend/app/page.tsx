"use client";

import Link from "next/link";
import { Sparkles, FileText, FolderKanban, Brain, ClipboardList } from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { card } from "@/lib/ui-classes";

const CARDS = [
  {
    href: "/requirements",
    icon: ClipboardList,
    title: "Requerimientos",
    description: "Catálogo de requerimientos cargados — selecciona uno para estimarlo.",
  },
  {
    href: "/estimate/new",
    icon: Sparkles,
    title: "Nueva estimación",
    description: "Describe un requerimiento y conversa con el agente para obtener esfuerzo, duración y costo.",
  },
  {
    href: "/estimates",
    icon: FileText,
    title: "Estimaciones",
    description: "Consulta cualquier estimación generada anteriormente, con su desglose completo.",
  },
  {
    href: "/projects",
    icon: FolderKanban,
    title: "Proyectos",
    description: "Gestiona el histórico de proyectos, importa desde Excel/CSV y registra resultados reales.",
  },
  {
    href: "/learning/proposals",
    icon: Brain,
    title: "Aprendizaje",
    description: "Revisa propuestas del Learning Agent y aprueba los ajustes respaldados por evidencia.",
  },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <RequireAuth>
      <div className="py-4">
        <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Hola{user?.name ? `, ${user.name}` : ""} 👋
        </h1>
        <p className="mb-8 text-slate-500 dark:text-slate-400">
          Estimador de proyectos de TI basado en evidencia histórica — no adivina, busca proyectos similares reales y te dice de dónde
          viene cada número.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {CARDS.map(({ href, icon: Icon, title, description }) => (
            <Link key={href} href={href} className={`${card} p-5 transition-shadow hover:shadow-md dark:hover:shadow-black/20`}>
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 dark:bg-azure-500/20">
                <Icon className="h-5 w-5 text-accent-600 dark:text-azure-400" strokeWidth={2} />
              </div>
              <h2 className="mb-1 font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
            </Link>
          ))}
        </div>
      </div>
    </RequireAuth>
  );
}
