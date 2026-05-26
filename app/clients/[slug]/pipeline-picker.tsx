"use client";

import { useTransition } from "react";
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
 * Anciennement dans ParametrageCard. Migré dans l'onglet Identité car le
 * pipeline est un attribut stable du client, pas par exercice.
 */
export default function PipelinePicker({
  clientId,
  current,
}: {
  clientId: string;
  current: PipelineStatut | null;
}) {
  const [isPending, startTransition] = useTransition();

  function onChange(next: PipelineStatut | null) {
    startTransition(async () => {
      await setPipelineStatut(clientId, next);
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-2",
        isPending && "opacity-60 pointer-events-none"
      )}
    >
      {PIPELINE_VALUES.map((p) => {
        const active = current === p;
        return (
          <button
            key={p}
            onClick={() => onChange(active ? null : p)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs border transition-colors",
              active
                ? PIPELINE_COLORS[p] ?? "bg-zinc-900 text-white border-zinc-900"
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
