"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barre d'action sticky en bas de page, affichee uniquement quand l'utilisateur
 * a >0 rows selectionnees. Style Linear / Notion : compact, sobre.
 *
 * Usage :
 *   <BulkActionBar
 *     count={selectedCount}
 *     onClear={clearSelection}
 *     options={[{ key: "depot_capital", label: "Dépôt de capital", color: "..." }, ...]}
 *     onApply={(libelle) => bulkApply(libelle)}
 *   />
 */
export function BulkActionBar({
  count,
  onClear,
  options,
  onApply,
  label = "Appliquer un statut",
  hint,
}: {
  count: number;
  onClear: () => void;
  options: Array<{ key: string; label: string; color: string; group?: string }>;
  onApply: (key: string) => void;
  label?: string;
  hint?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!pickerOpen || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = options.length * 32 + 60;
    const POPOVER_WIDTH = 260;
    const top = rect.top - POPOVER_HEIGHT - 8;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    setPos({ left, top: Math.max(8, top) });
  }, [pickerOpen, options.length]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  if (count === 0) return null;

  // Groupes pour le popover
  const grouped = new Map<string, typeof options>();
  for (const opt of options) {
    const g = opt.group ?? "";
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(opt);
  }

  return (
    <div
      role="region"
      aria-label={`${count} ligne(s) sélectionnée(s)`}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 animate-slide-up-fade"
    >
      <span className="text-[12px] font-medium tabular-nums">
        {count} ligne{count > 1 ? "s" : ""} sélectionnée{count > 1 ? "s" : ""}
      </span>
      {hint && <span className="text-[10px] text-white/60 dark:text-zinc-500 hidden sm:inline">· {hint}</span>}
      <div className="w-px h-4 bg-white/20 dark:bg-zinc-300 mx-1" />
      <button
        ref={btnRef}
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium bg-white/10 dark:bg-zinc-900/10 hover:bg-white/20 dark:hover:bg-zinc-900/20 transition-colors"
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Effacer la sélection"
        title="Effacer (Esc)"
        className="p-1 rounded hover:bg-white/10 dark:hover:bg-zinc-900/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {pickerOpen &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              zIndex: 1500,
            }}
            className="min-w-[260px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            <div className="px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06]">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                Appliquer à {count} ligne{count > 1 ? "s" : ""}
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto py-1">
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
    </div>
  );
}
