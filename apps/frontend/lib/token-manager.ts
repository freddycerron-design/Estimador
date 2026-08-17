/**
 * El access token de InsForge vive ~15 minutos. Sin refresco automático, cualquier sesión
 * abierta más de eso empieza a fallar con 401 en TODAS las llamadas autenticadas — eso es
 * justo lo que reportó el usuario en /projects y /estimate/[id]. Este módulo mantiene el
 * par access/refresh token en localStorage y refresca PROACTIVAMENTE (antes de que expire,
 * no reactivamente tras un 401) usando `POST /api/auth/refresh?client_type=server`, que
 * devuelve un `refreshToken` nuevo en el body — se pide `client_type=server` a propósito
 * para manejar el refresh nosotros mismos en vez de depender de la cookie httpOnly del
 * SDK (más simple de depurar, incluso para un cliente browser).
 */

const BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL!;
const STORAGE_KEY = "estimador_session";

interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function loadSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/auth/refresh?client_type=server`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return null;
  }
  const body = (await res.json()) as { accessToken: string; refreshToken: string };
  saveSession({ accessToken: body.accessToken, refreshToken: body.refreshToken });
  return body.accessToken;
}

/**
 * Devuelve un access token válido, refrescándolo primero si está por expirar (o ya expiró).
 * Los llamadores (api-client.ts, auth-context.tsx) deben usar esto en vez de leer el token
 * directamente de React state, para no quedarse con un valor obsoleto en un closure viejo.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = loadSession();
  if (!session) return null;

  const expiresAt = decodeJwtExpiryMs(session.accessToken);
  const expiringSoon = expiresAt !== null && expiresAt - Date.now() < 60_000; // refrescar con 60s de margen

  if (!expiringSoon) return session.accessToken;

  // Evitar refrescos concurrentes si varias llamadas a la API disparan esto a la vez.
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(session.refreshToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function getStoredAccessToken(): string | null {
  return loadSession()?.accessToken ?? null;
}
