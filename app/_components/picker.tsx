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
  resetLabel = "Réinitialiser",
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
  /** Si fourni, affiche un bouton de reset en bas du popover (visible
   *  uniquement si value !== null). Permet de revider la cellule vers null. */
  onReset?: () => void;
  /** Libelle du bouton de reset. Defaut "Réinitialiser". */
  resetLabel?: string;
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
  // Index visuel (parmi options dans l'ordre d'affichage, groupes mis a plat)
  // pour la navigation clavier. -1 = aucune selection visuelle.
  const [activeIdx, setActiveIdx] = useState<number>(-1);

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

  // Liste plate des options (tous groupes confondus), dans l'ordre
  // d'affichage. Utilise pour la nav clavier (Up/Down/Home/End/Enter).
  const flatOptions = groups.flatMap((g) => g.opts);

  // Au moment de l'ouverture, initialise activeIdx sur la valeur courante
  // (si elle existe) ou la 1ere option.
  useEffect(() => {
    if (!open) {
      setActiveIdx(-1);
      return;
    }
    const currentKey = current?.key;
    const idx = currentKey
      ? Math.max(0, flatOptions.findIndex((o) => o.key === currentKey))
      : 0;
    setActiveIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Scroll into view de l'option active.
  useEffect(() => {
    if (!open || activeIdx < 0 || !popRef.current) return;
    const el = popRef.current.querySelector<HTMLElement>(
      `[data-option-idx="${activeIdx}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  // Fermeture sur clic outside + Escape + nav clavier
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // Restaure le focus sur le bouton (sinon focus part sur body)
        btnRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, flatOptions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setActiveIdx(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setActiveIdx(flatOptions.length - 1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const opt = flatOptions[activeIdx];
        if (opt) {
          onChange(opt.key);
          setOpen(false);
          btnRef.current?.focus();
        }
        return;
      }
      if (e.key === "Tab") {
        // Tab ferme le popover (UX standard select / combobox) et laisse
        // la navigation Tab naturelle continuer vers l'element suivant.
        setOpen(false);
        return;
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
    // flatOptions est recalcule a chaque render mais .length + activeIdx
    // suffisent comme deps (Enter lit la liste courante via closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIdx, flatOptions.length, onChange]);

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
            {(() => {
              // Recalcule la liste plate ici pour mapper le bon `flatIdx`
              // a chaque option (la nav clavier l'utilise via data-option-idx).
              let runningIdx = 0;
              return groups.map((g, gi) => (
                <div key={g.name ?? `__${gi}`}>
                  {g.name && (
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-medium text-zinc-400 dark:text-zinc-500">
                      {g.name}
                    </div>
                  )}
                  {g.opts.map((o) => {
                    const flatIdx = runningIdx++;
                    const isActive = activeIdx === flatIdx;
                    const isSelected = value === o.key;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        data-option-idx={flatIdx}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        onClick={() => {
                          onChange(o.key);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors",
                          // Couleur de fond cumule : active (clavier/hover) > selected
                          isActive
                            ? "bg-zinc-100 dark:bg-white/[0.08]"
                            : isSelected
                            ? "bg-zinc-50 dark:bg-white/[0.04]"
                            : "hover:bg-zinc-50 dark:hover:bg-white/[0.04]"
                        )}
                      >
                        <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>
                          {o.label}
                        </span>
                        {isSelected && (
                          <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 ml-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
            {onReset && value !== null && (
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors border-t border-zinc-100 dark:border-white/[0.06]"
              >
                {resetLabel}
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
