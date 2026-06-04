"use client";

import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "./theme-provider";

/**
 * Toggle clair / sombre / systeme.
 *
 * UI : un bouton iconique compact qui ouvre un popover avec 3 options.
 * Place dans le ruban du haut (cote desktop) et dans le drawer mobile.
 *
 * Etat actif = surligne avec un dot gold. Le label texte des options aide
 * l'utilisateur a comprendre, surtout sur Mobile.
 *
 * A11y :
 *   - aria-haspopup + aria-expanded sur le declencheur
 *   - role="menu" + role="menuitemradio" sur les options
 *   - Esc ferme le popover
 *   - tab navigable
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sur le serveur, on ne sait pas le theme. On rend une coquille neutre
  // pour eviter le mismatch d'hydratation. Le vrai bouton apparait au mount.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Esc + clic dehors ferment le popover
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      ) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Icone affichee sur le declencheur : reflete le theme RESOLU
  // (light/dark/navy), pas la preference (qui peut etre "system").
  const Icon = !mounted
    ? Sun
    : resolvedTheme === "navy"
    ? Sparkles
    : resolvedTheme === "dark"
    ? Moon
    : Sun;

  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Clair", icon: Sun },
    { value: "dark", label: "Sombre", icon: Moon },
    { value: "navy", label: "Navy MOON", icon: Sparkles },
    { value: "system", label: "Système", icon: Monitor },
  ];

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme : ${theme}. Cliquer pour changer.`}
        title="Changer de theme"
        className={cn(
          "inline-flex items-center justify-center rounded-lg border transition-all",
          "border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04]",
          "text-zinc-600 dark:text-zinc-300",
          "hover:bg-zinc-50 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-white",
          "hover:border-zinc-300 dark:hover:border-white/[0.16]",
          compact ? "w-9 h-9" : "w-9 h-9"
        )}
      >
        <Icon className="h-4 w-4" />
      </button>

      {open && mounted && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Selection du theme"
          className={cn(
            "absolute right-0 mt-1.5 z-50",
            "min-w-[160px] rounded-xl border bg-white dark:bg-[hsl(var(--surface-elevated))]",
            "border-zinc-200 dark:border-white/[0.08] shadow-pop",
            "p-1 animate-slide-up-fade"
          )}
        >
          {options.map((opt) => {
            const OptIcon = opt.icon;
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-left",
                  active
                    ? "bg-zinc-100 dark:bg-white/[0.08] text-zinc-900 dark:text-white"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-white"
                )}
              >
                <OptIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{opt.label}</span>
                {active && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(var(--gold))]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
