import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Space Grotesk (títulos, wordmark, cifras grandes) + Inter (cuerpo/tablas) — antes la app
// corría entera en el sans-serif del sistema, sin ninguna personalidad tipográfica propia.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "EstimaDORA IA — Tu asistente inteligente para estimar proyectos de TI.",
  description: "Agente de estimación de proyectos de TI basado en evidencia histórica",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
