"use client";

import { cn } from "@/lib/utils";

/**
 * Chip de filtre par groupe de statut (a faire / en cours / termine).
 * Pattern partage IR + CAA + Creations + Missions exc en vue Annee.
 *
 *   <StatusFilterChip label="Tous" count={N} active={filter==="all"} onClick={...} />
 *   <StatusFilterChip label="À faire" count={N} active={...} onClick={...} accent="amber" />
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
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors border",
        active
          ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-50"
          : "bg-white dark:bg-white/[0.02] border-zinc-200/70 dark:border-white/[0.06] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/[0.12]"
      )}
    >
      {accent && (
        <span className={cn("inline-block w-1.5 h-1.5 rounded-full", accentDot[accent], active && "opacity-80")} />
      )}
      <span>{label}</span>
      <span className={cn("tabular-nums text-[10px]", active ? "text-white/70 dark:text-zinc-900/70" : "text-zinc-400 dark:text-zinc-500")}>
        {count}
      </span>
    </button>
  );
}
