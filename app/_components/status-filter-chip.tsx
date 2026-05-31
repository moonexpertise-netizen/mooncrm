"use client";

import { cn } from "@/lib/utils";

/**
 * Chip de filtre par groupe de statut (a faire / en cours / termine).
 * Pattern partage IR + CAA + Creations + Missions exc en vue Annee.
 *
 *   <StatusFilterChip label="Tous" count={N} active={filter==="all"} onClick={...} />
 *   <StatusFilterChip label="À faire" count={N} active={...} onClick={...} accent="amber" />
 *
 * Design : actif = highlight subtle (bg-zinc-100 / dark:bg-white/[0.08]) avec
 * border plus marquee. Le count est TOUJOURS dans une mini-pill gris fonce
 * pour rester lisible en dark mode meme quand le bouton est actif.
 */
export function StatusFilterChip({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent?: "amber" | "sky" | "emerald";
}) {
  const accentDot: Record<NonNullable<typeof accent>, string> = {
    amber: "bg-amber-400 dark:bg-amber-500",
    sky: "bg-sky-400 dark:bg-sky-500",
    emerald: "bg-emerald-400 dark:bg-emerald-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors border",
        active
          ? "bg-zinc-100/80 dark:bg-white/[0.08] border-zinc-300 dark:border-white/[0.20] text-zinc-900 dark:text-zinc-50"
          : "bg-white dark:bg-white/[0.02] border-zinc-200/70 dark:border-white/[0.06] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-white/[0.12]"
      )}
    >
      {accent && (
        <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", accentDot[accent])} />
      )}
      <span>{label}</span>
      {/* Count toujours dans une pill grise fonce → lisible en light + dark, actif + inactif */}
      <span
        className={cn(
          "tabular-nums text-[10px] px-1.5 py-0.5 rounded font-medium",
          active
            ? "bg-zinc-200/90 dark:bg-white/[0.10] text-zinc-700 dark:text-zinc-200"
            : "bg-zinc-100 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400"
        )}
      >
        {count}
      </span>
    </button>
  );
}
