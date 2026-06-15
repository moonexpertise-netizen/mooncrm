"use client";

import { Toaster } from "sonner";
import { useTheme } from "./theme-provider";

/**
 * Toaster sonner branché sur le thème RÉSOLU de l'app (et non `theme="system"`
 * qui ne suit que l'OS). Important : le thème "navy" de MoonCRM est un dark
 * mode — sonner ne connaît que light/dark, donc navy → "dark". Sans ça, en
 * navy avec un OS clair, les toasts s'affichaient en blanc sur l'app sombre.
 */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const sonnerTheme = resolvedTheme === "light" ? "light" : "dark";

  return (
    <Toaster
      position="top-right"
      theme={sonnerTheme}
      richColors
      closeButton
      duration={3500}
      toastOptions={{
        className: "text-sm",
        style: {
          fontFamily: "var(--font-sans), system-ui, sans-serif",
        },
      }}
    />
  );
}
