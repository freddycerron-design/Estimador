import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ProyecTIA — IA que estima. Datos que deciden. Proyectos que suceden.",
  description: "Agente de estimación de proyectos de TI basado en evidencia histórica",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
