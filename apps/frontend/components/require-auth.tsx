"use client";

import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { btnPrimary } from "@/lib/ui-classes";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="py-16 text-center text-slate-400">Cargando…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <p className="mb-4 text-slate-600">Necesitas iniciar sesión para continuar.</p>
        <Link href="/login" className={btnPrimary}>
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
