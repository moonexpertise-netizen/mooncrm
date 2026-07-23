"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { backfillObligationsForYear } from "./actions";
import { useCan } from "@/app/_components/permissions-context";
import { toastError } from "@/lib/toast-helpers";

/**
 * Rattrapage des instances d'obligations manquantes pour l'année affichée.
 * Sert quand une sub est active mais que la ligne d'obligation n'existe pas
 * (cellule bloquée sur "-" dans les trackers). Idempotent : ne touche pas aux
 * statuts déjà saisis.
 */
export default function BackfillButton({ year }: { year: number }) {
  const canEdit = useCan("edit_parametrage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!canEdit) return null;

  function run() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await backfillObligationsForYear(year);
        setMsg(
          r.created > 0
            ? `${r.created} obligation${r.created > 1 ? "s" : ""} créée${r.created > 1 ? "s" : ""}`
            : "Rien à rattraper"
        );
        router.refresh();
      } catch (e) {
        toastError(e, "Echec du rattrapage des obligations");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title={`Recrée les lignes d'obligations manquantes pour ${year} (cellules bloquées sur "-"). Ne modifie aucun statut.`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-white/[0.10] hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
      >
        <RefreshCw className={pending ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
        {pending ? "Rattrapage…" : "Rattraper les obligations"}
      </button>
      {msg && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{msg}</span>}
    </span>
  );
}
