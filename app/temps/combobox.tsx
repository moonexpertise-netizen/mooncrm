"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string };

/** Normalise pour une recherche insensible aux accents et à la casse. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Champ de recherche assistée (typeahead) : on tape, ça filtre, on choisit.
 * Remplace une liste déroulante quand il y a beaucoup d'options (dossiers...).
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  // Fermé : on affiche le libellé choisi ; ouvert : on affiche la recherche.
  const display = open ? query : selected?.label ?? "";

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q));
  }, [query, options]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        type="text"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
            setQuery("");
            setHi(0);
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[hi]) {
              e.preventDefault();
              select(filtered[hi].value);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        className="h-9 w-full px-2.5 rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {open && !disabled && (
        <div className="absolute z-50 mt-1 left-0 right-0 max-h-64 overflow-y-auto rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500">Aucun résultat</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(o.value);
                }}
                onMouseEnter={() => setHi(i)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm transition-colors",
                  i === hi
                    ? "bg-zinc-100 dark:bg-white/[0.08]"
                    : "hover:bg-zinc-50 dark:hover:bg-white/[0.04]",
                  o.value === value
                    ? "text-zinc-900 dark:text-zinc-100 font-medium"
                    : "text-zinc-700 dark:text-zinc-200"
                )}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
