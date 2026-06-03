"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Picker generique : bouton chip + popover de selection. Pattern unique
 * partage sur toute l'app pour les pickers de statut / etat / facturation /
 * LDM / cadence / etc. Remplace ~8 variantes recodees auparavant.
 *
 * Features :
 *   - value: T | null  (null = vide, affiche placeholder si allowEmpty)
 *   - options: liste plate OU groupees par section (headers visuels)
 *   - onReset (optionnel) : bouton "Reinitialiser" en bas qui set null
 *   - allowEmpty : autorise value=null (affiche placeholder au lieu de fallback)
 *   - disabled : grise le bouton, non cliquable
 *   - align : alignement horizontal du popover (right par defaut)
 *   - data-cell-button : sur le bouton, pour permettre focus DOM via querySelector
 *     (utile pour la nav clavier Excel-style)
 *
 * Popover positionne via getBoundingClientRect + createPortal -> echappe le
 * clipping des tables (overflow-x-auto + rounded-xl). openUp auto si pas
 * de place en dessous. Click outside + Escape ferment.
 */

export type PickerOption<T extends string> = {
  key: T;
  label: string;
  color: string;
  /** Groupe optionnel : si fourni, les options sont regroupees sous un
   *  header avec ce libelle. Ex. "À faire" / "En cours" / "Terminé" */
  group?: string;
};

export function Picker<T extends string>({
  value,
  options,
  onChange,
  onReset,
  allowEmpty = false,
  disabled = false,
  placeholder = "—",
  placeholderTitle,
  align = "right",
  size = "sm",
  minWidth = 180,
}: {
  value: T | null;
  options: Array<PickerOption<T>>;
  onChange: (v: T) => void;
  /** Si fourni, affiche un bouton "Réinitialiser" en bas du popover (visible
   *  uniquement si value !== null). Permet de revider la cellule vers null. */
  onReset?: () => void;
  /** Si true et value=null, affiche le placeholder au lieu du fallback options[0]. */
  allowEmpty?: boolean;
  /** Grise le bouton et le rend non cliquable. */
  disabled?: boolean;
  /** Affiche quand value=null + allowEmpty. Defaut: "—" (tiret cadratin). */
  placeholder?: string;
  /** Tooltip sur le bouton quand value=null. Ex. "Facturation non encore définie". */
  placeholderTitle?: string;
  /** Aligne le bord droit du popover sur le bord droit du bouton (defaut),
   *  ou le bord gauche, ou centre. */
  align?: "left" | "right" | "center";
  /** Taille du chip. xs = [10px], sm = [11px] (defaut). */
  size?: "xs" | "sm";
  /** Largeur min du popover en px. */
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  const matched = options.find((o) => o.key === value);
  const isEmpty = allowEmpty && value === null;
  const current = matched ?? (isEmpty ? null : options[0] ?? null);

  // Groupement des options par `group`. Si aucune option n'a de group,
  // on rend en liste plate (pas de header).
  const hasGroups = options.some((o) => o.group);
  const groups: Array<{ name: string | null; opts: typeof options }> = (() => {
    if (!hasGroups) return [{ name: null, opts: options }];
    const map = new Map<string, typeof options>();
    const order: string[] = [];
    for (const o of options) {
      const g = o.group ?? "";
      if (!map.has(g)) {
        map.set(g, []);
        order.push(g);
      }
      map.get(g)!.push(o);
    }
    return order.map((g) => ({ name: g || null, opts: map.get(g)! }));
  })();

  // Positionne le popover. createPortal pour echapper le clipping de la table.
  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    // Estimation hauteur popover : nb d'items * 28px + headers (24px chacun)
    // + footer reset (32px) + padding (16px).
    const headerCount = hasGroups ? groups.length : 0;
    const resetH = onReset && value !== null ? 32 : 0;
    const POPOVER_HEIGHT = options.length * 28 + headerCount * 24 + resetH + 16;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;

    let left: number;
    if (align === "right") {
      const desiredLeft = rect.right - minWidth;
      left = Math.max(MARGIN, Math.min(desiredLeft, window.innerWidth - MARGIN - minWidth));
    } else if (align === "left") {
      left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - MARGIN - minWidth));
    } else {
      // center
      const center = rect.left + rect.width / 2 - minWidth / 2;
      left = Math.max(MARGIN, Math.min(center, window.innerWidth - MARGIN - minWidth));
    }
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open, options.length, hasGroups, groups.length, onReset, value, align, minWidth]);

  // Fermeture sur clic outside + Escape
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const textSize = size === "xs" ? "text-[10px]" : "text-[11px]";

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        data-cell-button
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center px-2 py-1 rounded font-medium border transition-all whitespace-nowrap",
          textSize,
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:opacity-80 cursor-pointer",
          current?.color ??
            "bg-transparent dark:bg-transparent text-zinc-400 dark:text-zinc-500 border-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.04]"
        )}
        title={isEmpty ? placeholderTitle : undefined}
      >
        {current?.label ?? placeholder}
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)",
              zIndex: 1000,
              minWidth: `${minWidth}px`,
            }}
            className="bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {groups.map((g, gi) => (
              <div key={g.name ?? `__${gi}`}>
                {g.name && (
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-medium text-zinc-400 dark:text-zinc-500">
                    {g.name}
                  </div>
                )}
                {g.opts.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => {
                      onChange(o.key);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                      value === o.key && "bg-zinc-50 dark:bg-white/[0.04]"
                    )}
                  >
                    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>
                      {o.label}
                    </span>
                    {value === o.key && (
                      <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            ))}
            {onReset && value !== null && (
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors border-t border-zinc-100 dark:border-white/[0.06]"
              >
                Réinitialiser
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
