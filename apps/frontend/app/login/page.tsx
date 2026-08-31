"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { btnPrimary, input, label, card } from "@/lib/ui-classes";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password, name);
    setSubmitting(false);
    if (result) {
      setError(result);
      return;
    }
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-sm py-16">
      <div className="mb-6 flex flex-col items-center text-center">
        {/* Logo completo (ícono + wordmark + tagline), no solo el ícono (spec pedido por usuario). */}
        <Image src="/brand/estimadora-logo.jpg" alt="EstimaDORA — Sistema de Estimación de Proyectos" width={2276} height={580} className="mb-3 h-16 w-auto object-contain" priority />
        <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tu asistente inteligente para estimar proyectos de TI.</p>
      </div>
      <div className={`${card} p-6`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className={label}>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={input} required />
            </div>
          )}
          <div>
            <label className={label}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} required />
          </div>
          <div>
            <label className={label}>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} minLength={6} required />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={submitting} className={`${btnPrimary} w-full justify-center`}>
            {submitting ? "…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
      </div>
      <button
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="mt-4 w-full text-center text-sm text-brand-600 hover:underline dark:text-brand-400"
      >
        {mode === "signin" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Inicia sesión"}
      </button>
    </div>
  );
}
