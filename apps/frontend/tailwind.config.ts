import type { Config } from "tailwindcss";

// EXTRA IMPORTANT (InsForge docs): mantener Tailwind en 3.4, no subir a v4.
// Paleta tomada de una referencia visual del usuario (SaaS admin: acento naranja/coral
// cálido para acciones primarias, violeta suave para insignias de "IA", barra superior
// con degradado oscuro→naranja).
const config: Config = {
  // Modo oscuro adicional al claro actual (spec pedido por usuario) — activado por una clase
  // `dark` en <html> (ver lib/theme.ts + components/theme-toggle.tsx), no solo por preferencia
  // del sistema, para que el usuario pueda elegirlo explícitamente.
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // var(--font-*) las define next/font en layout.tsx (Space Grotesk / Inter, self-hosted).
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#FEF3F0",
          100: "#FCE1D8",
          200: "#F9C4B2",
          300: "#F49E80",
          400: "#EE7550",
          500: "#EA5A32",
          600: "#DC4620",
          700: "#B8371A",
          800: "#8F2C16",
        },
        accent: {
          50: "#F5F3FF",
          100: "#EDE9FE",
          200: "#DDD6FE",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
        },
        // Variante de "accent" para modo oscuro (spec pedido por usuario: "el color morado se
        // pierde [en oscuro], cambia a un azul"). El violeta de `accent` está pensado para leerse
        // sobre fondos claros; además varios usos referenciaban accent-300/400, que nunca
        // existieron en esta paleta, así que en oscuro esos textos ni siquiera tomaban color
        // propio. `azure` es un azul saturado y luminoso pensado específicamente para contrastar
        // sobre el navy oscuro de la app (mismo rol que `accent`: insignias/iconos de "IA").
        azure: {
          100: "#E0EEFF",
          200: "#BFDFFF",
          300: "#8AC4FF",
          400: "#56A8FF",
          500: "#2E8BFF",
          600: "#1868DB",
          700: "#124FAA",
        },
        navy: {
          600: "#374361",
          700: "#2B3550",
          800: "#212A42",
          900: "#181F33",
        },
      },
      backgroundImage: {
        "nav-gradient": "linear-gradient(110deg, #181F33 0%, #2B3550 35%, #8B3A2E 70%, #DC4620 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
