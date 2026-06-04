"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Theme provider MoonCRM.
 *
 * 3 etats supportes : `light` | `dark` | `system`.
 *   - `system` (defaut) : suit `prefers-color-scheme` du navigateur
 *   - `light` / `dark`  : force le theme, persiste dans localStorage
 *
 * Architecture :
 *   - Le choix utilisateur vit dans localStorage (cle : "mooncrm-theme")
 *   - Un <script> inline dans <head> applique la classe AVANT hydratation
 *     React, pour eviter le FOUC (flash of unstyled content)
 *   - Ce composant client se synchronise au mount + ecoute les changements
 *     du systeme si `theme === "system"`
 *
 * Usage : <ThemeProvider>{children}</ThemeProvider> dans le RootLayout.
 * Pour toggler depuis l'UI : import { useTheme } from "./theme-provider".
 */

export type Theme = "light" | "dark" | "navy" | "system";
type ResolvedTheme = "light" | "dark" | "navy";

const STORAGE_KEY = "mooncrm-theme";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Lit la preference systeme via matchMedia. Renvoie "dark" si l'utilisateur
 * a active le mode sombre dans son OS, sinon "light".
 */
function getSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resoud le theme effectif (jamais "system" en sortie) selon le choix utilisateur
 * et la preference systeme.
 */
function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemPreference() : theme;
}

/**
 * Applique le theme sur <html> :
 *   - light : aucune classe
 *   - dark  : classe `.dark`
 *   - navy  : classes `.dark .navy` (= dark + override fond bleu marine)
 * Idempotent.
 */
function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("dark", "navy");
  if (resolved === "dark") {
    root.classList.add("dark");
  } else if (resolved === "navy") {
    // Navy = dark + override des couleurs de fond. On garde .dark pour que
    // toutes les utilities Tailwind `dark:` continuent de s'appliquer.
    root.classList.add("dark", "navy");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // On part de "system" par defaut. Le vrai etat est lu en useEffect (cote client).
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  // Au mount : lit localStorage + resout + applique.
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setThemeState(stored);
    const resolved = resolveTheme(stored);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // Si l'utilisateur a choisi "system", on ecoute les changements de
  // prefers-color-scheme et on suit.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    const resolved = resolveTheme(t);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Pas de provider : on retourne un fallback inerte (utile pour les
    // composants rendus en isolation pendant les tests). En prod l'app est
    // toujours wrappee dans ThemeProvider.
    return {
      theme: "system",
      resolvedTheme: "light",
      setTheme: () => {},
    };
  }
  return ctx;
}

/**
 * Script inline a injecter dans <head> AVANT le rendu React, pour appliquer
 * la classe `dark` sur <html> immediatement et eviter tout flash blanc -> sombre.
 *
 * On lit localStorage + on consulte matchMedia synchroneusement. Si le script
 * crashe (cookies/localStorage desactives), on retombe sur light (gracieux).
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}') || 'system';
    var resolved = stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : stored;
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (resolved === 'navy') {
      // Navy = dark + override fond bleu marine
      document.documentElement.classList.add('dark', 'navy');
    }
  } catch (e) {}
})();
`;
