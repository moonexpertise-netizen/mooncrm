"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barre d'action sticky en bas de page, affichee uniquement quand l'utilisateur
 * a >0 cellules selectionnees.
 *
 * Design : compact en bas de page, mode "hybride intelligent" :
 *   - Si ≤4 options et pas de groupes -> chips inline (1 clic = applique)
 *   - Sinon -> bouton "Appliquer ▾" qui ouvre un menu
 *
 * Toujours :
 *   - Compteur "N cellules - <colonne active>"
 *   - Bouton `?` avec tooltip des raccourcis clavier
 *   - Bouton X (Esc) pour vider la selection
 *
 * Usage :
 *   <BulkActionBar
 *     count={selectedCount}
 *     onClear={clearSelection}
 *     columnLabel="Facturation"   // titre de la colonne active
 *     options={[{ key, label, color }]}
 *     onApply={(key) => bulkApply(key)}
 *   />
 */
export function BulkActionBar({
  count,
  onClear,
  options,
  onApply,
  columnLabel,
  /** @deprecated utiliser columnLabel */
  label,
}: {
  count: number;
  onClear: () => void;
  options: Array<{ key: string; label: string; color: string; group?: string }>;
  onApply: (key: string) => void;
  /** Titre de la colonne active. Ex. "Facturation", "Statut IR". */
  columnLabel?: string;
  /** Compat ancien API. */
  label?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const helpPopRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number; maxHeight: number } | null>(null);
  const [helpPos, setHelpPos] = useState<{ left: number; bottom: number; maxHeight: number } | null>(null);

  // Hybride : chips inline si peu d'options + pas de groupes multiples
  const groupSet = new Set(options.map((o) => o.group ?? ""));
  const hasMultipleGroups = groupSet.size > 1;
  const useInlineChips = options.length <= 4 && !hasMultipleGroups;

  // Position du popover "Appliquer" : ancre depuis le bas (bottom) du viewport
  // jusqu'au-dessus du bouton, avec maxHeight pour rentrer dans l'espace dispo.
  // Le popover grandit donc vers le haut depuis le bouton sans deborder.
  useEffect(() => {
    if (!pickerOpen || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_WIDTH = 260;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    // bottom = espace entre le bord bas du viewport et le bord haut du bouton + gap
    const bottom = window.innerHeight - rect.top + 8;
    // maxHeight = tout l'espace dispo au-dessus du bouton (avec 16px margin top)
    const maxHeight = Math.max(180, rect.top - 16);
    setPos({ left, bottom, maxHeight });
  }, [pickerOpen, options.length]);

  // Position du tooltip aide (meme logique : ancre depuis le bas)
  useEffect(() => {
    if (!helpOpen || !helpRef.current) {
      setHelpPos(null);
      return;
    }
    const rect = helpRef.current.getBoundingClientRect();
    const POPOVER_WIDTH = 280;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - POPOVER_WIDTH / 2, window.innerWidth - POPOVER_WIDTH - 8));
    const bottom = window.innerHeight - rect.top + 8;
    const maxHeight = Math.max(180, rect.top - 16);
    setHelpPos({ left, bottom, maxHeight });
  }, [helpOpen]);

  // Click outside + Esc pour les 2 popovers
  useEffect(() => {
    if (!pickerOpen && !helpOpen) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (pickerOpen) {
        if (btnRef.current?.contains(t)) return;
        if (popRef.current?.contains(t)) return;
        setPickerOpen(false);
      }
      if (helpOpen) {
        if (helpRef.current?.contains(t)) return;
        if (helpPopRef.current?.contains(t)) return;
        setHelpOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (pickerOpen) setPickerOpen(false);
        if (helpOpen) setHelpOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen, helpOpen]);

  if (count === 0) return null;

  // Groupes pour le popover dropdown
  const grouped = new Map<string, typeof options>();
  for (const opt of options) {
    const g = opt.group ?? "";
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(opt);
  }

  const colLabel = columnLabel ?? label ?? "Appliquer";

  return (
    <div
      role="region"
      aria-label={`${count} cellule(s) sélectionnée(s)`}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 animate-slide-up-fade"
    >
      {/* Compteur + nom de la colonne active */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-[12px] font-medium tabular-nums">
          {count} cellule{count > 1 ? "s" : ""}
        </span>
        {columnLabel && (
          <>
            <span className="text-white/40 dark:text-zinc-400">·</span>
            <span className="text-[12px] font-medium text-white/80 dark:text-zinc-700">{columnLabel}</span>
          </>
        )}
      </div>

      <div className="w-px h-4 bg-white/20 dark:bg-zinc-300 mx-0.5" />

      {/* Mode chips inline (≤4 options) */}
      {useInlineChips ? (
        <div className="flex items-center gap-1">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onApply(o.key)}
              className={cn(
                "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80",
                o.color
              )}
              title={`Appliquer "${o.label}" à ${count} cellule${count > 1 ? "s" : ""}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        /* Mode bouton dropdown (>4 options ou groupes multiples) */
        <button
          ref={btnRef}
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium bg-white/10 dark:bg-zinc-900/10 hover:bg-white/20 dark:hover:bg-zinc-900/20 transition-colors"
        >
          Appliquer
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      )}

      <div className="w-px h-4 bg-white/20 dark:bg-zinc-300 mx-0.5" />

      {/* Bouton "?" -> tooltip raccourcis */}
      <button
        ref={helpRef}
        type="button"
        onClick={() => setHelpOpen((v) => !v)}
        aria-label="Raccourcis clavier"
        title="Raccourcis clavier"
        className={cn(
          "p-1 rounded hover:bg-white/10 dark:hover:bg-zinc-900/10 transition-colors",
          helpOpen && "bg-white/10 dark:bg-zinc-900/10"
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {/* Bouton X = clear */}
      <button
        type="button"
        onClick={onClear}
        aria-label="Effacer la sélection"
        title="Effacer (Esc)"
        className="p-1 rounded hover:bg-white/10 dark:hover:bg-zinc-900/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Popover : liste des options (mode dropdown) */}
      {pickerOpen &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              bottom: `${pos.bottom}px`,
              maxHeight: `${pos.maxHeight}px`,
              zIndex: 1500,
            }}
            className="min-w-[260px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] flex flex-col overflow-hidden animate-slide-up-fade"
          >
            <div className="px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06] shrink-0">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                Appliquer à {count} cellule{count > 1 ? "s" : ""}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {[...grouped.entries()].map(([groupLabel, opts], gi) => (
                <div key={groupLabel || gi}>
                  {groupLabel && (
                    <div className={cn(
                      "px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium",
                      gi > 0 && "border-t border-zinc-100 dark:border-white/[0.06] mt-1"
                    )}>
                      {groupLabel}
                    </div>
                  )}
                  {opts.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => {
                        onApply(o.key);
                        setPickerOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
                    >
                      <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>
                        {o.label}
                      </span>
                      <Check className="h-3 w-3 text-zinc-300 dark:text-zinc-600 ml-auto" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}

      {/* Tooltip raccourcis clavier */}
      {helpOpen &&
        helpPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={helpPopRef}
            style={{
              position: "fixed",
              left: `${helpPos.left}px`,
              bottom: `${helpPos.bottom}px`,
              maxHeight: `${helpPos.maxHeight}px`,
              zIndex: 1500,
            }}
            className="min-w-[280px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-y-auto animate-slide-up-fade"
          >
            <div className="px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06]">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                Raccourcis clavier
              </div>
            </div>
            <div className="px-3 py-2.5 space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
              <ShortcutRow keys={["↑", "↓"]} desc="Naviguer dans la colonne" />
              <ShortcutRow keys={["←", "→"]} desc="Changer de colonne" />
              <ShortcutRow keys={["Shift", "clic"]} desc="Étendre la sélection" />
              <ShortcutRow keys={["⌘", "clic"]} desc="Ajouter / retirer" />
              <ShortcutRow keys={["⌘", "A"]} desc="Tout sélectionner" />
              <ShortcutRow keys={["⌘", "C"]} desc="Copier" />
              <ShortcutRow keys={["⌘", "V"]} desc="Coller" />
              <ShortcutRow keys={["Esc"]} desc="Vider la sélection" />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-600 dark:text-zinc-400">{desc}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        {keys.map((k, i) => (
          <span key={i} className="inline-flex">
            {i > 0 && <span className="px-0.5 text-zinc-400 dark:text-zinc-500">+</span>}
            <kbd className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded border border-zinc-200 dark:border-white/[0.10] bg-zinc-50 dark:bg-white/[0.04] text-[10px] font-medium font-mono text-zinc-700 dark:text-zinc-300">
              {k}
            </kbd>
          </span>
        ))}
      </div>
    </div>
  );
}
