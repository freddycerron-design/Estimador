import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Content-Security-Policy nivel 3, basado en nonce (spec pedido por usuario: cumplir CSP nivel
 * 3). El patrón "Strict CSP" (nonce + 'strict-dynamic', recomendado por Google/Next.js) es lo que
 * distingue CSP3 de una whitelist de dominios estilo CSP1/2: en vez de confiar en qué ORIGEN sirve
 * un script, se confía en un nonce aleatorio generado por request — un script inyectado por XSS no
 * puede adivinarlo, así que no se ejecuta aunque venga del mismo origen.
 *
 * Se genera un nonce nuevo en cada request, se manda tanto en el header `Content-Security-Policy`
 * de la respuesta como en un header interno `x-nonce` (para que `app/layout.tsx` lo lea vía
 * `headers()` y lo aplique al único `<script>` inline propio de la app — el de inicialización de
 * tema). Next.js aplica automáticamente ese mismo nonce a los scripts que él mismo inyecta,
 * siempre que lo detecte en el CSP de la respuesta.
 *
 * `'unsafe-inline' https:` en script-src son fallback para navegadores viejos que no entienden
 * nonce/strict-dynamic — los navegadores modernos los ignoran en presencia de un nonce (no es un
 * debilitamiento real, es el patrón "Strict CSP" documentado de Google/Next.js).
 *
 * style-src permite 'unsafe-inline': Next.js inyecta internamente `<style>` para `next/font`
 * (evitar FOUC) sin exponer un nonce controlable desde acá — el riesgo de inyección de CSS puro es
 * mucho menor que el de scripts (no puede ejecutar JS), así que es el trade-off estándar aceptado
 * incluso en los ejemplos de "Strict CSP" de Google/Next.js, que solo exigen nonce en script-src.
 *
 * connect-src incluye los dos orígenes reales a los que esta app llama por fetch: el backend
 * propio (NEXT_PUBLIC_API_BASE_URL) e InsForge (Auth/Storage, NEXT_PUBLIC_INSFORGE_BASE_URL).
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const insforgeBaseUrl = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL ?? "";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    font-src 'self';
    connect-src 'self' ${apiBaseUrl} ${insforgeBaseUrl};
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
    object-src 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  // No corre sobre assets estáticos (no necesitan CSP propio y así cada uno mantiene su cacheo
  // normal, sin volverse "dinámico" por depender de un nonce por-request).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon\\.jpg|brand/).*)"],
};
