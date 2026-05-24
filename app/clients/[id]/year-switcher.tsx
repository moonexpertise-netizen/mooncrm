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
    <div className={cn("flex flex-wrap items-center gap-2", isPending && "opacity-60 pointer-events-none")}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Exercice</div>
      {years.map((y) => (
        <button
          key={y}
          onClick={() => go(y)}
          className={cn(
            "px-3 py-1 rounded-md text-sm border transition-colors",
            y === selected
              ? "bg-[hsl(var(--gold))] text-white border-[hsl(var(--gold))] shadow-sm"
              : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400"
          )}
        >
          {y}
        </button>
      ))}
      <button
        onClick={() => addNewYear(nextYearProposed)}
        className="px-2 py-1 rounded-md text-sm border border-dashed border-zinc-300 text-zinc-500 hover:bg-zinc-50"
        title={`Paramétrer l'exercice ${nextYearProposed} (DAS2 + CFE cochés par défaut)`}
      >
        + {nextYearProposed}
      </button>
    </div>
  );
}
