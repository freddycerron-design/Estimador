/**
 * Modo oscuro adicional al claro actual (spec pedido por usuario) — tres estados, no un simple
 * on/off: "system" (por defecto, sigue `prefers-color-scheme`), "light" y "dark" forzados
 * explícitamente por el usuario. Persistido en localStorage; aplicado como clase `dark` en
 * <html> (ver tailwind.config.ts `darkMode: "class"`).
 */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "estimadora-theme";

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system"; // localStorage puede fallar en navegación privada — no debe romper la app.
  }
}

export function storeThemePreference(pref: ThemePreference): void {
  try {
    if (pref === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Sin persistencia no pasa nada grave — el tema simplemente no sobrevive un refresh.
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveIsDark(pref: ThemePreference): boolean {
  return pref === "dark" || (pref === "system" && systemPrefersDark());
}

export function applyTheme(pref: ThemePreference): void {
  document.documentElement.classList.toggle("dark", resolveIsDark(pref));
}

/** Script inyectado antes del primer paint (ver layout.tsx) para evitar el flash de tema claro
 * al cargar con "dark" u "oscuro por sistema" ya elegido — debe quedar en sync con la lógica de
 * arriba. No puede importar nada: corre standalone en el <head>. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
