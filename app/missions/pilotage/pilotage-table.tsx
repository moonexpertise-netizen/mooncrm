"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import {
  setPilotageCadence,
  setPilotageStatut,
  type PilotageType,
  type PilotageStatutLogique,
} from "./actions";

export type PilotageCell = {
  id: string;
  statut_logique: PilotageStatutLogique;
  statut_detail: string | null;
};

export type PilotageRow = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  cadence: string | null; // 'Mensuelle'/'Trimestrielle' (TDB) ou 'Mensuel'/'Trimestriel' (RDV)
  cells: Map<string, PilotageCell>;
};

// ============================================================================
//  Constantes
// ============================================================================

const MONTHS_SHORT = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const MENSUEL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const TRIMESTRIEL_MONTHS = [3, 6, 9, 12];

// Statuts (et leurs couleurs) par type
const TDB_OPTIONS: Array<{ libelle: string; logique: PilotageStatutLogique; color: string }> = [
  { libelle: "À préparer", logique: "A_FAIRE", color: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/30" },
  { libelle: "Préparé", logique: "EN_COURS", color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30" },
  { libelle: "Présenté", logique: "TERMINE", color: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/30" },
  { libelle: "N/A", logique: "NON_APPLICABLE", color: "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-white/[0.10]" },
];

const RDV_OPTIONS: Array<{ libelle: string; logique: PilotageStatutLogique; color: string }> = [
  { libelle: "RDV à planifier", logique: "A_FAIRE", color: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/30" },
  { libelle: "RDV planifié", logique: "EN_COURS", color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30" },
  { libelle: "RDV réalisé", logique: "TERMINE", color: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/30" },
  { libelle: "N/A", logique: "NON_APPLICABLE", color: "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-white/[0.10]" },
];

const EMPTY_COLOR = "bg-white dark:bg-white/[0.02] text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10]";

// ============================================================================
//  Composant principal
// ============================================================================

export default function PilotageTable({
  rows,
  year,
  type,
}: {
  rows: PilotageRow[];
  year: number;
  type: PilotageType;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);

  const STATUS_OPTIONS = type === "TDB" ? TDB_OPTIONS : RDV_OPTIONS;
  const cadenceLabel = type === "TDB" ? "Mensuelle" : "Mensuel";
  const cadenceLabelTri = type === "TDB" ? "Trimestrielle" : "Trimestriel";

  // Tri par denomination. Tous les rows sont souscrits (filtre cote server).
  const sortedRows = localRows.slice().sort((a, b) => a.denomination.localeCompare(b.denomination, "fr"));

  // ============================================================================
  //  Actions
  // ============================================================================

  function onSetCadence(clientId: string, value: string) {
    // Optimistic
    setLocalRows((prev) => prev.map((r) => (r.id === clientId ? { ...r, cadence: value } : r)));
    startTransition(async () => {
      const res = await setPilotageCadence(
        clientId,
        type === "TDB" ? "tdb" : "rdv",
        value as Parameters<typeof setPilotageCadence>[2]
      );
      if (!res.ok) {
        toastError(new Error(res.error ?? "Erreur"), "Échec changement cadence");
      }
      router.refresh();
    });
  }

  function onSetStatut(clientId: string, periode: string, libelle: string | null) {
    // Optimistic
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientId) return r;
        const cell = r.cells.get(periode);
        if (!cell) return r;
        const opt = STATUS_OPTIONS.find((o) => o.libelle === libelle);
        const newCells = new Map(r.cells);
        newCells.set(periode, {
          ...cell,
          statut_logique: opt?.logique ?? "A_FAIRE",
          statut_detail: libelle ?? (type === "TDB" ? "À préparer" : "RDV à planifier"),
        });
        return { ...r, cells: newCells };
      })
    );
    startTransition(async () => {
      const res = await setPilotageStatut(clientId, year, type, periode, libelle);
      if (!res.ok) {
        toastError(new Error(res.error ?? "Erreur"), "Échec sauvegarde statut");
        router.refresh();
      }
    });
  }

  // ============================================================================
  //  URL helpers (year + type)
  // ============================================================================

  function urlForYear(y: number) {
    return `/missions/pilotage?year=${y}&type=${type}`;
  }
  function urlForType(t: PilotageType) {
    return `/missions/pilotage?year=${year}&type=${t}`;
  }
  const years = [year - 1, year, year + 1];

  // ============================================================================
  //  Rendu
  // ============================================================================

  return (
    <div className="space-y-3">
      {/* Onglets type + sélecteur année */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav
          aria-label="Type de pilotage"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]"
        >
          <Link
            href={urlForType("TDB")}
            aria-current={type === "TDB" ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-all",
              type === "TDB"
                ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 font-semibold"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
            )}
          >
            Tableau de bord
          </Link>
          <Link
            href={urlForType("RDV")}
            aria-current={type === "RDV" ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-all",
              type === "RDV"
                ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 font-semibold"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
            )}
          >
            RDV Expert
          </Link>
        </nav>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
          {years.map((y) => (
            <Link
              key={y}
              href={urlForYear(y)}
              className={cn(
                "px-3 py-1 rounded-lg text-sm tabular-nums transition-all",
                y === year
                  ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
              )}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      {sortedRows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
          <p>Aucun dossier souscrit au suivi {type === "TDB" ? "Tableau de bord" : "RDV Expert"} pour l&apos;exercice {year}.</p>
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
            Active le suivi depuis la fiche client → onglet Obligations → carte « Pilotage / Dashboard ».
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]" aria-label="Suivi Pilotage">
            <thead className="bg-zinc-50/50 dark:bg-white/[0.02] border-b border-zinc-200/70 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 sticky left-0 bg-zinc-50/50 dark:bg-white/[0.02] min-w-[220px]">
                  Client
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[130px]">
                  Cadence
                </th>
                {MONTHS_SHORT.map((m, i) => (
                  <th key={i} scope="col" className="px-2 py-2 text-center font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[80px]">
                    {m}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {sortedRows.map((r) => {
                return (
                  <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-[hsl(var(--card))]">
                      <Link
                        href={`/clients/${r.slug}`}
                        className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                      >
                        {r.denomination}
                      </Link>
                      {r.siren && (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{r.siren}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.cadence ?? cadenceLabel}
                        onChange={(e) => onSetCadence(r.id, e.target.value)}
                        className="px-1.5 py-0.5 rounded text-[12px] border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      >
                        <option value={cadenceLabel}>{cadenceLabel}</option>
                        <option value={cadenceLabelTri}>{cadenceLabelTri}</option>
                      </select>
                    </td>
                    {MENSUEL_MONTHS.map((m) => {
                      const periode = `${year}-${String(m).padStart(2, "0")}`;
                      const cell = r.cells.get(periode);
                      return (
                        <td key={m} className="px-1 py-2 text-center align-middle">
                          {cell ? (
                            <StatutPicker
                              value={cell.statut_detail}
                              options={STATUS_OPTIONS}
                              onChange={(libelle) => onSetStatut(r.id, periode, libelle)}
                            />
                          ) : (
                            <span className="inline-block w-6 h-6 rounded border border-dashed border-zinc-200 dark:border-white/[0.06]" />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right">
                      <Link
                        href={`/clients/${r.slug}`}
                        className="inline-flex items-center justify-center p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors"
                        aria-label={`Ouvrir ${r.denomination}`}
                        title="Ouvrir la fiche"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1">
        {sortedRows.length} dossier{sortedRows.length > 1 ? "s" : ""} souscrit{sortedRows.length > 1 ? "s" : ""} à l&apos;exercice {year}.
      </p>
    </div>
  );
}

// ============================================================================
//  StatutPicker : popover Notion-style en portal
// ============================================================================

function StatutPicker({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: Array<{ libelle: string; logique: PilotageStatutLogique; color: string }>;
  onChange: (libelle: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = options.find((o) => o.libelle === value) ?? null;

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = options.length * 32 + 50;
    const POPOVER_WIDTH = 200;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const desiredLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    const left = Math.max(MARGIN, Math.min(desiredLeft, window.innerWidth - MARGIN - POPOVER_WIDTH));
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all hover:opacity-80 whitespace-nowrap min-w-[64px] justify-center",
          current ? current.color : EMPTY_COLOR
        )}
      >
        <span className="truncate max-w-[80px]">{current ? current.libelle : "-"}</span>
        <ChevronDown className="h-2.5 w-2.5 opacity-60 shrink-0" />
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)",
              zIndex: 1000,
            }}
            className="min-w-[200px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {options.map((o) => {
              const isActive = value === o.libelle;
              return (
                <button
                  key={o.libelle}
                  type="button"
                  onClick={() => {
                    onChange(o.libelle);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                    isActive && "bg-zinc-50 dark:bg-white/[0.04]"
                  )}
                >
                  <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>
                    {o.libelle}
                  </span>
                  {isActive && <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 ml-auto" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
