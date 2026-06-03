"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import { setPilotagePeriode, type PilotagePeriode } from "./actions";

/**
 * Card "Pilotage / Dashboard" : cadences TdB + RDV expert, client-level.
 *
 * Sans impact sur la lettre de mission (rythme de production interne).
 * Les changements regenerent les obligations PILOTAGE_TDB / PILOTAGE_RDV
 * dans les 2 trackers (purge des mois hors-cadence encore vierges, preserve
 * les mois deja travailles).
 *
 * Visible meme si Dashboard pas encore active : permet de pre-configurer.
 * Une fois Dashboard active (matrice obligations), les obligations sont
 * generees selon ces cadences.
 */
export default function PilotageFieldsCard({
  clientId,
  initialTdbPeriode,
  initialRdvPeriode,
}: {
  clientId: string;
  initialTdbPeriode: string | null;
  initialRdvPeriode: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tdb, setTdb] = useState<string>(initialTdbPeriode ?? "");
  const [rdv, setRdv] = useState<string>(initialRdvPeriode ?? "");

  function onChange(aspect: "tdb" | "rdv", value: PilotagePeriode) {
    if (aspect === "tdb") setTdb(value);
    else setRdv(value);
    startTransition(async () => {
      try {
        await setPilotagePeriode(clientId, aspect, value);
        router.refresh();
      } catch (e) {
        toastError(e, "Échec sauvegarde cadence");
        // Revert
        if (aspect === "tdb") setTdb(initialTdbPeriode ?? "");
        else setRdv(initialRdvPeriode ?? "");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Mise à disposition tableau de bord */}
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm text-zinc-600 dark:text-zinc-400 shrink-0">
          Mise à disposition tableau de bord
        </label>
        <select
          value={tdb}
          onChange={(e) => onChange("tdb", e.target.value as PilotagePeriode)}
          className={cn(
            "px-2 py-1 rounded-md border text-[13px] focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white dark:bg-white/[0.04]",
            tdb
              ? "border-zinc-300 dark:border-white/[0.12] text-zinc-800 dark:text-zinc-200"
              : "border-dashed border-zinc-300 dark:border-white/[0.10] text-zinc-500 dark:text-zinc-400"
          )}
        >
          <option value="">— Non défini —</option>
          <option value="Mensuelle">Mensuelle</option>
          <option value="Trimestrielle">Trimestrielle</option>
        </select>
      </div>

      {/* RDV expert */}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 dark:border-white/[0.06] pt-3">
        <label className="text-sm text-zinc-600 dark:text-zinc-400 shrink-0">
          Rendez-vous expert
        </label>
        <select
          value={rdv}
          onChange={(e) => onChange("rdv", e.target.value as PilotagePeriode)}
          className={cn(
            "px-2 py-1 rounded-md border text-[13px] focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white dark:bg-white/[0.04]",
            rdv
              ? "border-zinc-300 dark:border-white/[0.12] text-zinc-800 dark:text-zinc-200"
              : "border-dashed border-zinc-300 dark:border-white/[0.10] text-zinc-500 dark:text-zinc-400"
          )}
        >
          <option value="">— Non défini —</option>
          <option value="Mensuel">Mensuel</option>
          <option value="Trimestriel">Trimestriel</option>
        </select>
      </div>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        Rythme de production · sans impact sur la lettre de mission. Génère les obligations dans les trackers <span className="font-medium">Tableau de bord</span> et <span className="font-medium">RDV Expert</span> quand le suivi Dashboard est activé pour ce dossier.
      </p>
    </div>
  );
}
