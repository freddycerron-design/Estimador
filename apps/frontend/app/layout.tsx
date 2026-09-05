import type { Metadata } from "next";
import { headers } from "next/headers";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Space Grotesk (títulos, wordmark, cifras grandes) + Inter (cuerpo/tablas) — antes la app
// corría entera en el sans-serif del sistema, sin ninguna personalidad tipográfica propia.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "EstimaDORA IA — Tu asistente inteligente para estimar proyectos de TI.",
  description: "Agente de estimación de proyectos de TI basado en evidencia histórica",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce generado en middleware.ts (CSP nivel 3, spec pedido por usuario) — leerlo acá con
  // `headers()` vuelve este layout dinámico (no pre-renderizable estáticamente): un nonce debe
  // ser distinto en cada respuesta, así que es incompatible por definición con una página
  // estática generada una sola vez en build. Es el trade-off documentado del patrón oficial de
  // Next.js para CSP con nonce.
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Aplica el modo oscuro (si corresponde) ANTES del primer paint — evita el flash de
            tema claro al recargar con "oscuro" u "oscuro por sistema" ya elegido. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
