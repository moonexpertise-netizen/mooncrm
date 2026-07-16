"use client";

import { cn } from "@/lib/utils";

/**
 * Sélecteur d'année MONO-valeur (liste déroulante compacte). Utilisé pour les
 * modules où un dossier a AU PLUS une année (Créations, CAA) — remplace les
 * anciennes pastilles multi-années.
 *
 *   value = année sélectionnée (null = aucune)
 *   onChange(year | null) — "— Aucune —" renvoie null
 *
 * Si `value` est hors de la fenêtre `years`, elle est ajoutée pour rester
 * visible/sélectionnée.
 */
export function YearSelect({
  years,
  value,
  onChange,
  disabled = false,
  className,
}: {
  years: number[];
  value: number | null;
  onChange: (year: number | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const opts = value != null && !years.includes(value) ? [value, ...years] : years;
  const sorted = [...new Set(opts)].sort((a, b) => b - a); // décroissant (récent en haut)

  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
      className={cn(
        "px-2 py-1 rounded-md border text-xs tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] disabled:opacity-50 disabled:cursor-not-allowed",
        value != null
          ? "bg-[hsl(var(--gold))]/10 border-[hsl(var(--gold))]/50 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] font-semibold"
          : "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.10] text-zinc-500 dark:text-zinc-400",
        className
      )}
    >
      <option value="">— Aucune —</option>
      {sorted.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
