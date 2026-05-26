"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, PIPELINE_COLORS } from "@/lib/utils";
import { setPipelineStatut, type PipelineStatut } from "./actions";

const PIPELINE_VALUES: PipelineStatut[] = [
  "1 - Tally à envoyer",
  "2 - Tally à compléter",
  "3 - PC à préparer",
  "4 - PC envoyée",
  "5 - PC acceptée",
  "6 - LDM envoyée",
  "7 - LDM signée",
  "Z - Interne",
  "Z - Sous-traitance",
  "Z - Prospect perdu",
  "Z - Résiliée",
];

/**
 * Sélecteur de statut pipeline (radio pills colorées).
 *
 * State local + sync via prop (pattern editable.tsx) pour l'optimistic update :
 * le clic met l'UI à jour immédiatement, puis router.refresh() repropage la
 * donnée serveur. Sans le router.refresh, la prop ne se mettait pas à jour
 * et il fallait F5 pour voir le nouveau statut.
 */
export default function PipelinePicker({
  clientId,
  current,
}: {
  clientId: string;
  current: PipelineStatut | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState<PipelineStatut | null>(current);

  // Resync quand le serveur revient
  useEffect(() => setLocal(current), [current]);

  function onChange(next: PipelineStatut | null) {
    setLocal(next); // optimistic
    startTransition(async () => {
      await setPipelineStatut(clientId, next);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-2",
        isPending && "opacity-80"
      )}
    >
      {PIPELINE_VALUES.map((p) => {
        const active = local === p;
        const colorClass = PIPELINE_COLORS[p];
        return (
          <button
            key={p}
            onClick={() => onChange(active ? null : p)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs border transition-all duration-150 active:scale-95",
              active
                ? // Active : couleur du statut + ring sans offset blanc (qui
                  // creait un halo blanc en dark mode).
                  cn(
                    colorClass ?? "bg-zinc-900 text-white border-zinc-900",
                    "shadow-sm ring-2 ring-zinc-400 dark:ring-white/30 font-medium"
                  )
                : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}
