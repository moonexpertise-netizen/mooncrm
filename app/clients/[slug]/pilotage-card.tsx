"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import {
  setPilotageCadence,
  togglePilotageSubscription,
} from "@/app/missions/pilotage/actions";

/**
 * Card "Pilotage / Dashboard" pour la fiche client - onglet Obligations.
 *
 * ISOLE de la matrice : utilise pilotage_obligations + client_year_config,
 * pas l'enum type_obligation partage. Aucun risque de crash cascadant.
 *
 * Par annee, on peut :
 *   - Toggle Tableau de bord ON/OFF (PILOTAGE_TDB)
 *   - Toggle RDV Expert ON/OFF (PILOTAGE_RDV)
 *   - Choisir la cadence TdB (Mensuelle/Trimestrielle) - cf. client_year_config
 *   - Choisir la cadence RDV (Mensuel/Trimestriel)
 *
 * La cadence est par annee (comme le regime IR/IS), donc un client peut
 * passer mensuel -> trimestriel d'une annee a l'autre.
 */
export type PilotageActiveMap = {
  // { 2025: { TDB: true, RDV: false, tdbCadence: "Mensuelle", rdvCadence: null }, ... }
  [annee: number]: {
    TDB: boolean;
    RDV: boolean;
    tdbCadence: string | null;
    rdvCadence: string | null;
  };
};

export default function PilotageCard({
  clientId,
  years,
  active,
}: {
  clientId: string;
  years: number[];
  active: PilotageActiveMap;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localActive, setLocalActive] = useState<PilotageActiveMap>(active);

  function getCell(annee: number) {
    return localActive[annee] ?? { TDB: false, RDV: false, tdbCadence: null, rdvCadence: null };
  }

  function isActive(annee: number, type: "TDB" | "RDV"): boolean {
    return getCell(annee)[type];
  }

  function onToggle(annee: number, type: "TDB" | "RDV") {
    const cur = getCell(annee);
    const next = !cur[type];
    setLocalActive((prev) => ({
      ...prev,
      [annee]: { ...cur, [type]: next },
    }));
    startTransition(async () => {
      const res = await togglePilotageSubscription(clientId, annee, type, next);
      if (!res.ok) {
        toastError(new Error(res.error ?? "Erreur"), "Échec activation suivi");
        setLocalActive((prev) => ({
          ...prev,
          [annee]: { ...cur, [type]: !next },
        }));
      }
      router.refresh();
    });
  }

  function onCadenceChange(annee: number, aspect: "tdb" | "rdv", value: string) {
    const cur = getCell(annee);
    const prevValue = aspect === "tdb" ? cur.tdbCadence : cur.rdvCadence;
    setLocalActive((prev) => ({
      ...prev,
      [annee]: {
        ...cur,
        tdbCadence: aspect === "tdb" ? value : cur.tdbCadence,
        rdvCadence: aspect === "rdv" ? value : cur.rdvCadence,
      },
    }));
    startTransition(async () => {
      const res = await setPilotageCadence(
        clientId,
        annee,
        aspect,
        value as Parameters<typeof setPilotageCadence>[3]
      );
      if (!res.ok) {
        toastError(new Error(res.error ?? "Erreur"), "Échec changement cadence");
        setLocalActive((prev) => ({
          ...prev,
          [annee]: {
            ...cur,
            tdbCadence: aspect === "tdb" ? prevValue : cur.tdbCadence,
            rdvCadence: aspect === "rdv" ? prevValue : cur.rdvCadence,
          },
        }));
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Pilotage</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Suivi Tableau de bord + RDV Expert, cadence par exercice, sans impact sur la lettre de mission.
          </p>
        </div>
        <Link
          href="/missions/pilotage"
          className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded border border-zinc-200 dark:border-white/[0.10] hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors shrink-0"
        >
          Voir le suivi →
        </Link>
      </div>

      {/* Tableau toggle + cadence par annee */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-white/[0.02] text-zinc-600 dark:text-zinc-400 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium min-w-[200px]">Aspect</th>
              {years.map((y) => (
                <th key={y} className="px-2 py-2 text-center font-medium tabular-nums w-[120px]">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {/* TDB : toggle + cadence */}
            <tr className="hover:bg-amber-50/40 dark:hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-2 font-medium">Tableau de bord</td>
              {years.map((y) => {
                const on = isActive(y, "TDB");
                return (
                  <td key={y} className="px-1 py-2 text-center align-middle">
                    <div className="flex flex-col items-center gap-1.5">
                      <Toggle on={on} onClick={() => onToggle(y, "TDB")} />
                      {on && (
                        <select
                          value={getCell(y).tdbCadence || "Mensuelle"}
                          onChange={(e) => onCadenceChange(y, "tdb", e.target.value)}
                          className="px-1.5 py-0.5 rounded text-[11px] border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        >
                          <option value="Mensuelle">Mensuelle</option>
                          <option value="Trimestrielle">Trimestrielle</option>
                        </select>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
            {/* RDV : toggle + cadence */}
            <tr className="hover:bg-amber-50/40 dark:hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-2 font-medium">RDV Expert</td>
              {years.map((y) => {
                const on = isActive(y, "RDV");
                return (
                  <td key={y} className="px-1 py-2 text-center align-middle">
                    <div className="flex flex-col items-center gap-1.5">
                      <Toggle on={on} onClick={() => onToggle(y, "RDV")} />
                      {on && (
                        <select
                          value={getCell(y).rdvCadence || "Mensuel"}
                          onChange={(e) => onCadenceChange(y, "rdv", e.target.value)}
                          className="px-1.5 py-0.5 rounded text-[11px] border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        >
                          <option value="Mensuel">Mensuel</option>
                          <option value="Trimestriel">Trimestriel</option>
                        </select>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-7 h-7 inline-flex items-center justify-center rounded border transition-transform active:scale-95",
        "border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.02]",
        "group/cell relative overflow-hidden"
      )}
      title={on ? "Désactiver le suivi" : "Activer le suivi"}
    >
      <span
        className={cn(
          "absolute inset-0 inline-flex items-center justify-center transition-opacity duration-100",
          "bg-emerald-500/95 text-white",
          on ? "opacity-100" : "opacity-0 group-hover/cell:opacity-60"
        )}
      >
        <span className="text-[13px] font-bold leading-none">✓</span>
      </span>
    </button>
  );
}
