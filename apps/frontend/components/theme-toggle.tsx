"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, MonitorSmartphone, type LucideIcon } from "lucide-react";
import { getStoredThemePreference, storeThemePreference, applyTheme, type ThemePreference } from "@/lib/theme";

const ORDER: ThemePreference[] = ["system", "light", "dark"];
const META: Record<ThemePreference, { icon: LucideIcon; label: string }> = {
  system: { icon: MonitorSmartphone, label: "Tema: según el sistema" },
  light: { icon: Sun, label: "Tema: claro" },
  dark: { icon: Moon, label: "Tema: oscuro" },
};

/** Botón de un solo ícono que rota entre sistema → claro → oscuro (spec pedido por usuario: un
 * modo oscuro adicional al claro actual). El estado ya se aplicó antes del primer paint (ver
 * THEME_INIT_SCRIPT en layout.tsx) — acá solo se sincroniza el ícono y se reacciona a cambios. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    setPref(getStoredThemePreference());
  }, []);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system") return;
    // En "system", si el usuario cambia la preferencia del SO mientras la app está abierta,
    // seguirla en vivo en vez de quedar pegado al valor que tenía al cargar.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [pref]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!;
    setPref(next);
    storeThemePreference(next);
  }

  const { icon: Icon, label } = META[pref];
  return (
    <button
      onClick={cycle}
      title={label}
      aria-label={`${label} — clic para cambiar`}
      className="rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}
