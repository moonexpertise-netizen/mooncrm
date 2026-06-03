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
 * ISOLE de la matrice : utilise pilotage_obligations (table dediee, cf.
 * migration 0062), pas l'enum type_obligation partage. Aucun risque de
 * crash cascadant sur la matrice ou les autres modules.
 *
 * Permet par annee :
 *   - Toggle "Suivi Tableau de bord" (TDB) ON/OFF
 *   - Toggle "Suivi RDV Expert" (RDV) ON/OFF
 * Au niveau client :
 *   - Cadence TdB (Mensuelle / Trimestrielle)
 *   - Cadence RDV (Mensuel / Trimestriel)
 */
export type PilotageActiveMap = {
  // { 2025: { TDB: true, RDV: false }, ... }
  [annee: number]: { TDB: boolean; RDV: boolean };
};

export default function PilotageCard({
  clientId,
  years,
  active,
  initialTdbCadence,
  initialRdvCadence,
}: {
  clientId: string;
  years: number[];
  active: PilotageActiveMap;
  initialTdbCadence: string | null;
  initialRdvCadence: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localActive, setLocalActive] = useState<PilotageActiveMap>(active);
  const [tdbCadence, setTdbCadence] = useState<string>(initialTdbCadence ?? "");
  const [rdvCadence, setRdvCadence] = useState<string>(initialRdvCadence ?? "");

  function isActive(annee: number, type: "TDB" | "RDV"): boolean {
    return localActive[annee]?.[type] ?? false;
  }

  function onToggle(annee: number, type: "TDB" | "RDV") {
    const next = !isActive(annee, type);
    // Optimistic
    setLocalActive((prev) => ({
      ...prev,
      [annee]: { ...(prev[annee] ?? { TDB: false, RDV: false }), [type]: next },
    }));
    startTransition(async () => {
      const res = await togglePilotageSubscription(clientId, annee, type, next);
      if (!res.ok) {
        toastError(new Error(res.error ?? "Erreur"), "Échec activation suivi");
        // Revert
        setLocalActive((prev) => ({
          ...prev,
          [annee]: { ...(prev[annee] ?? { TDB: false, RDV: false }), [type]: !next },
        }));
      }
      router.refresh();
    });
  }

  function onCadenceChange(aspect: "tdb" | "rdv", value: string) {
    const prevValue = aspect === "tdb" ? tdbCadence : rdvCadence;
    if (aspect === "tdb") setTdbCadence(value);
    else setRdvCadence(value);
    startTransition(async () => {
      const res = await setPilotageCadence(
        clientId,
        aspect,
        value as Parameters<typeof setPilotageCadence>[2]
      );
      if (!res.ok) {
        toastError(new Error(res.error ?? "Erreur"), "Échec changement cadence");
        if (aspect === "tdb") setTdbCadence(prevValue);
        else setRdvCadence(prevValue);
      }
      router.refresh();
    });
  }

  const hasAnyActive = years.some((y) => isActive(y, "TDB") || isActive(y, "RDV"));

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            Pilotage / Dashboard
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Suivi Tableau de bord + RDV Expert · sans impact sur la lettre de mission.
          </p>
        </div>
        <Link
          href="/missions/pilotage"
          className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded border border-zinc-200 dark:border-white/[0.10] hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors shrink-0"
        >
          Voir le suivi →
        </Link>
      </div>

      {/* Tableau toggle par annee + type */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-white/[0.02] text-zinc-600 dark:text-zinc-400 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Aspect</th>
              {years.map((y) => (
                <th key={y} className="px-2 py-2 text-center font-medium tabular-nums w-[80px]">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            <tr className="hover:bg-amber-50/40 dark:hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-2 font-medium">Tableau de bord</td>
              {years.map((y) => {
                const on = isActive(y, "TDB");
                return (
                  <td key={y} className="px-1 py-2 text-center">
                    <Toggle on={on} onClick={() => onToggle(y, "TDB")} />
                  </td>
                );
              })}
            </tr>
            <tr className="hover:bg-amber-50/40 dark:hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-2 font-medium">RDV Expert</td>
              {years.map((y) => {
                const on = isActive(y, "RDV");
                return (
                  <td key={y} className="px-1 py-2 text-center">
                    <Toggle on={on} onClick={() => onToggle(y, "RDV")} />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cadences (visibles si au moins un suivi est actif quelque part).
          Les 2 selecteurs sont colles a leur label puis cote a cote avec un
          gap modere pour rester atteignables sans traverser toute la largeur. */}
      {hasAnyActive && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Cadence tableau de bord</span>
            <select
              value={tdbCadence || "Mensuelle"}
              onChange={(e) => onCadenceChange("tdb", e.target.value)}
              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-[13px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <option value="Mensuelle">Mensuelle</option>
              <option value="Trimestrielle">Trimestrielle</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Cadence RDV expert</span>
            <select
              value={rdvCadence || "Mensuel"}
              onChange={(e) => onCadenceChange("rdv", e.target.value)}
              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-[13px] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <option value="Mensuel">Mensuel</option>
              <option value="Trimestriel">Trimestriel</option>
            </select>
          </label>
        </div>
      )}
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
