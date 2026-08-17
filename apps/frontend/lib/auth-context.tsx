"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { insforge } from "./insforge-client";
import { saveSession, clearSession, getValidAccessToken, getStoredAccessToken } from "./token-manager";

interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string, name: string): Promise<string | null>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!;

interface RestAuthResponse {
  user?: { id: string; email: string; profile?: { name?: string } };
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  message?: string;
}

/**
 * Se llama a la REST API directa (no al método del SDK) con `client_type=server` a propósito:
 * así la respuesta trae un `refreshToken` explícito en el body que podemos guardar y usar
 * nosotros mismos (ver token-manager.ts) — el flujo `web` por defecto del SDK depende de una
 * cookie httpOnly cross-origin que complica el refresco desde este frontend.
 */
async function restAuthCall(path: string, body: Record<string, unknown>): Promise<{ data: RestAuthResponse | null; error: string | null }> {
  const res = await fetch(`${BASE_URL}${path}?client_type=server`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as RestAuthResponse;
  if (!res.ok) return { data: null, error: json.message ?? json.error ?? `Error ${res.status}` };
  return { data: json, error: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getValidAccessToken().then(async (token) => {
      if (!token) {
        setLoading(false);
        return;
      }
      const { data } = await insforge.auth.getCurrentUser();
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email, name: data.user.profile?.name });
      } else {
        clearSession();
      }
      setLoading(false);
    });
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    const { data, error } = await restAuthCall("/api/auth/sessions", { method: "password", email, password });
    if (error || !data?.accessToken || !data.refreshToken || !data.user) return error ?? "No se pudo iniciar sesión";
    saveSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser({ id: data.user.id, email: data.user.email, name: data.user.profile?.name });
    return null;
  }

  async function signUp(email: string, password: string, name: string): Promise<string | null> {
    const { data, error } = await restAuthCall("/api/auth/users", { email, password, name });
    if (error) return error;
    if (!data?.accessToken || !data.refreshToken || !data.user) return "Cuenta creada. Inicia sesión para continuar.";
    saveSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser({ id: data.user.id, email: data.user.email, name });
    return null;
  }

  async function signOut(): Promise<void> {
    await insforge.auth.signOut().catch(() => {});
    clearSession();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

/** Para lib/api-client.ts — siempre pide el token vigente (refresca solo si hace falta), nunca uno guardado en un closure viejo. */
export { getValidAccessToken, getStoredAccessToken };
