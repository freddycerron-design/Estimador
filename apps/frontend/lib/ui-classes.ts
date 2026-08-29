/** Clases Tailwind compartidas — mantiene consistente el look & feel sin una librería de componentes.
 * Incluye variantes `dark:` (modo oscuro adicional al claro, spec pedido por usuario) reusando la
 * paleta navy ya definida en tailwind.config.ts (antes solo usada en el gradiente del nav). */
export const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700";
export const btnDanger =
  "inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-navy-800 dark:text-red-400 dark:hover:bg-red-950/40";
export const btnGhost =
  "inline-flex items-center gap-1.5 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-slate-300";

export const iconBtn =
  "inline-flex items-center justify-center rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-navy-700 dark:hover:text-slate-200";
export const iconBtnDanger =
  "inline-flex items-center justify-center rounded-full p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400";

export const card = "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-navy-700 dark:bg-navy-800";
export const cardPadded = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-navy-700 dark:bg-navy-800";

export const badge = "inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-navy-700 dark:text-slate-300";
export const badgeAccent =
  "inline-flex items-center rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-medium text-accent-700 dark:bg-accent-500/20 dark:text-accent-300";
export const badgeBrand =
  "inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/20 dark:text-brand-300";

export const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 dark:placeholder-slate-500";
export const label = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";
