import type { LucideIcon } from "lucide-react";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5 dark:border-navy-700">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 dark:bg-azure-500/20">
          <Icon className="h-5 w-5 text-accent-600 dark:text-azure-400" strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
