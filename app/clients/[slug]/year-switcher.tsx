"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { initializeYear } from "./actions";

export default function YearSwitcher({
  years,
  selected,
  clientId,
}: {
  years: number[];
  selected: number;
  clientId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function go(y: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(y));
    router.push(url.pathname + url.search);
  }

  function addNewYear(y: number) {
    startTransition(async () => {
      await initializeYear(clientId, y);
      go(y);
    });
  }

  const maxYear = Math.max(...years, selected);
  const nextYearProposed = maxYear + 1;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", isPending && "opacity-60 pointer-events-none")}>
      <div className="text-[10px] uppercase tracking-wider font-medium text-zinc-500 dark:text-zinc-400 mr-1">
        Exercice
      </div>
      {years.map((y) => {
        const active = y === selected;
        return (
          <button
            key={y}
            onClick={() => go(y)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-2.5 py-1 rounded-md text-[13px] font-medium border tabular-nums transition-colors",
              active
                ? "bg-zinc-100/80 dark:bg-white/[0.08] border-zinc-300 dark:border-white/[0.20] text-zinc-900 dark:text-zinc-50"
                : "bg-white dark:bg-white/[0.02] border-zinc-200/70 dark:border-white/[0.06] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-white/[0.12]"
            )}
          >
            {y}
          </button>
        );
      })}
      <button
        onClick={() => addNewYear(nextYearProposed)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium tabular-nums border border-dashed border-zinc-300 dark:border-white/[0.10] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-white/[0.20] hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors"
        title={`Paramétrer l'exercice ${nextYearProposed} (DAS2 + CFE cochés par défaut)`}
      >
        <span className="text-zinc-400 dark:text-zinc-500">+</span>
        {nextYearProposed}
      </button>
    </div>
  );
}
