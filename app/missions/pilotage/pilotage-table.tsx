"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { BulkActionBar } from "@/app/_components/bulk-action-bar";
import { StatusFilterChip } from "@/app/_components/status-filter-chip";
import { toggleFilterKey } from "@/app/_components/filter-multi-select";
import { useCan } from "@/app/_components/permissions-context";
import { Picker } from "@/app/_components/picker";
import { useLocalStorageSet } from "@/app/_components/use-local-storage-pref";
import { useGridSelection } from "@/app/_components/use-grid-selection";
import { computeEcheancePilotage, getUrgencyStatus } from "@/lib/echeances";
import {
  bulkSetPilotageStatut,
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

/** Un sous-suivi (Tableau de bord OU RDV Expert) pour un client. */
export type PilotageSubRow = {
  cadence: string | null; // 'Mensuelle'/'Trimestrielle' (TDB) ou 'Mensuel'/'Trimestriel' (RDV)
  cells: Map<string, PilotageCell>;
};

/** Un client = ses 2 sous-suivis (logique dissociee, affichage groupe). */
export type PilotageRow = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  tdb: PilotageSubRow;
  rdv: PilotageSubRow;
};

// ============================================================================
//  Constantes
// ============================================================================

const MONTHS_SHORT = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const MENSUEL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// Trimestriel : cellule sur le dernier mois du trimestre (= periode couverte).
const TRIMESTRIEL_MONTHS = [3, 6, 9, 12];
const TRIMESTRE_LABEL: Record<number, string> = {
  3: "T1, Janv-Fév-Mars (livraison avril)",
  6: "T2, Avr-Mai-Juin (livraison juillet)",
  9: "T3, Juil-Août-Sept (livraison octobre)",
  12: "T4, Oct-Nov-Déc (livraison janvier N+1)",
};

type Logique = PilotageStatutLogique;
type Opt = { libelle: string; logique: Logique; color: string };

// Statuts (et couleurs) par type. Memes 4 statuts logiques, libelles distincts.
const TDB_OPTIONS: Opt[] = [
  { libelle: "À préparer", logique: "A_FAIRE", color: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/30" },
  { libelle: "Préparé", logique: "EN_COURS", color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30" },
  { libelle: "Présenté", logique: "TERMINE", color: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/30" },
  { libelle: "N/A", logique: "NON_APPLICABLE", color: "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-white/[0.10]" },
];

const RDV_OPTIONS: Opt[] = [
  { libelle: "RDV à planifier", logique: "A_FAIRE", color: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/30" },
  { libelle: "RDV planifié", logique: "EN_COURS", color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30" },
  { libelle: "RDV réalisé", logique: "TERMINE", color: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/30" },
  { libelle: "N/A", logique: "NON_APPLICABLE", color: "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-white/[0.10]" },
];

function optionsFor(kind: PilotageType): Opt[] {
  return kind === "TDB" ? TDB_OPTIONS : RDV_OPTIONS;
}
function defaultLibelle(kind: PilotageType): string {
  return kind === "TDB" ? "À préparer" : "RDV à planifier";
}
function libelleForLogique(kind: PilotageType, logique: Logique): string | null {
  return optionsFor(kind).find((o) => o.logique === logique)?.libelle ?? null;
}
const KIND_LABEL: Record<PilotageType, string> = {
  TDB: "Tableau de bord",
  RDV: "RDV Expert",
};
function cadenceLabels(kind: PilotageType): { mensuel: string; tri: string } {
  return kind === "TDB"
    ? { mensuel: "Mensuelle", tri: "Trimestrielle" }
    : { mensuel: "Mensuel", tri: "Trimestriel" };
}

type StatusGroup = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

// ============================================================================
//  Composant principal
// ============================================================================

export default function PilotageTable({
  rows,
  year,
}: {
  rows: PilotageRow[];
  year: number;
}) {
  const router = useRouter();
  const canEditProduction = useCan("edit_production");
  const [, startTransition] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);

  const [filter, setFilter] = useLocalStorageSet<StatusGroup>(
    "moon.pilotage.statusFilter",
    new Set(),
    (k): k is StatusGroup =>
      k === "A_FAIRE" || k === "EN_COURS" || k === "TERMINE" || k === "NON_APPLICABLE",
  );

  // Tri par denomination (tous souscrits cote serveur).
  const sortedRows = useMemo(
    () => localRows.slice().sort((a, b) => a.denomination.localeCompare(b.denomination, "fr")),
    [localRows]
  );

  // Compteurs par statut sur TOUTES les cellules (tdb + rdv).
  const counts = useMemo(() => {
    const c = { total: 0, A_FAIRE: 0, EN_COURS: 0, TERMINE: 0, NON_APPLICABLE: 0 };
    for (const r of localRows) {
      for (const sub of [r.tdb, r.rdv]) {
        for (const cell of sub.cells.values()) {
          c.total++;
          c[cell.statut_logique]++;
        }
      }
    }
    return c;
  }, [localRows]);

  // Filtre : on garde le client si AU MOINS une cellule (tdb ou rdv) matche.
  const filteredRows = useMemo(() => {
    if (filter.size === 0) return sortedRows;
    return sortedRows.filter((r) => {
      for (const sub of [r.tdb, r.rdv]) {
        for (const cell of sub.cells.values()) {
          if (filter.has(cell.statut_logique as StatusGroup)) return true;
        }
      }
      return false;
    });
  }, [sortedRows, filter]);

  // Lignes a plat : 2 par client (TDB puis RDV). MEME ordre que le rendu
  // (filteredRows.flatMap) pour que les index correspondent a gridIds.
  type Line = {
    clientId: string;
    kind: PilotageType;
    cells: Map<string, PilotageCell>;
  };
  const lines: Line[] = useMemo(
    () =>
      filteredRows.flatMap((r) => [
        { clientId: r.id, kind: "TDB" as const, cells: r.tdb.cells },
        { clientId: r.id, kind: "RDV" as const, cells: r.rdv.cells },
      ]),
    [filteredRows]
  );

  // Grille 2D : gridIds[line][col] = cellId ou null.
  const gridIds: (string | null)[][] = useMemo(() => {
    return lines.map((line) =>
      MENSUEL_MONTHS.map((m) => {
        const periode = `${year}-${String(m).padStart(2, "0")}`;
        const cell = line.cells.get(periode);
        return cell && !cell.id.startsWith("optimistic-") ? cell.id : null;
      })
    );
  }, [lines, year]);

  // Map cellId -> contexte (client + kind + periode) pour bulk / paste.
  const idToContext = useMemo(() => {
    const m = new Map<string, { clientId: string; kind: PilotageType; periode: string }>();
    for (const r of localRows) {
      for (const kind of ["TDB", "RDV"] as const) {
        const sub = kind === "TDB" ? r.tdb : r.rdv;
        for (const [periode, cell] of sub.cells) {
          m.set(cell.id, { clientId: r.id, kind, periode });
        }
      }
    }
    return m;
  }, [localRows]);

  // --- Helpers d'ecriture (optimistic + serveur), type-aware -------------

  /** Met a jour une cellule dans le bon sous-suivi du client. */
  function patchCell(
    prev: PilotageRow[],
    clientId: string,
    kind: PilotageType,
    periode: string,
    next: PilotageCell
  ): PilotageRow[] {
    return prev.map((r) => {
      if (r.id !== clientId) return r;
      const sub = kind === "TDB" ? r.tdb : r.rdv;
      if (!sub.cells.has(periode)) return r;
      const newCells = new Map(sub.cells);
      newCells.set(periode, next);
      return kind === "TDB"
        ? { ...r, tdb: { ...r.tdb, cells: newCells } }
        : { ...r, rdv: { ...r.rdv, cells: newCells } };
    });
  }

  function onSetStatut(clientId: string, kind: PilotageType, periode: string, libelle: string | null) {
    setLocalRows((prev) => {
      const sub = prev.find((r) => r.id === clientId);
      const cell = sub && (kind === "TDB" ? sub.tdb : sub.rdv).cells.get(periode);
      if (!cell) return prev;
      const opt = optionsFor(kind).find((o) => o.libelle === libelle);
      return patchCell(prev, clientId, kind, periode, {
        ...cell,
        statut_logique: opt?.logique ?? "A_FAIRE",
        statut_detail: libelle ?? defaultLibelle(kind),
      });
    });
    startTransition(async () => {
      const res = await setPilotageStatut(clientId, year, kind, periode, libelle);
      if (!res.ok) {
        toastError(new Error(res.error ?? "Erreur"), "Échec sauvegarde statut");
        router.refresh();
      }
    });
  }

  function onSetCadence(clientId: string, kind: PilotageType, value: string) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientId) return r;
        return kind === "TDB"
          ? { ...r, tdb: { ...r.tdb, cadence: value } }
          : { ...r, rdv: { ...r.rdv, cadence: value } };
      })
    );
    startTransition(async () => {
      const res = await setPilotageCadence(
        clientId,
        year,
        kind === "TDB" ? "tdb" : "rdv",
        value as Parameters<typeof setPilotageCadence>[3]
      );
      if (!res.ok) toastError(new Error(res.error ?? "Erreur"), "Échec changement cadence");
      router.refresh();
    });
  }

  /** Applique une cible logique a une liste d'ids, en resolvant le libelle
   *  selon le type (TDB/RDV) de chaque cellule. Optimistic + serveur groupe
   *  par type (les server actions prennent un type unique). */
  function applyLogiqueToIds(ids: string[], logique: Logique | "__reset__") {
    if (ids.length === 0) return;
    // Optimistic
    setLocalRows((prev) =>
      prev.map((r) => {
        let tdb = r.tdb;
        let rdv = r.rdv;
        for (const kind of ["TDB", "RDV"] as const) {
          const sub = kind === "TDB" ? r.tdb : r.rdv;
          let touched = false;
          const newCells = new Map(sub.cells);
          for (const [periode, cell] of sub.cells) {
            if (!ids.includes(cell.id)) continue;
            touched = true;
            if (logique === "__reset__") {
              newCells.set(periode, { ...cell, statut_logique: "A_FAIRE", statut_detail: defaultLibelle(kind) });
            } else {
              const libelle = libelleForLogique(kind, logique);
              newCells.set(periode, { ...cell, statut_logique: logique, statut_detail: libelle ?? defaultLibelle(kind) });
            }
          }
          if (touched) {
            if (kind === "TDB") tdb = { ...r.tdb, cells: newCells };
            else rdv = { ...r.rdv, cells: newCells };
          }
        }
        return tdb === r.tdb && rdv === r.rdv ? r : { ...r, tdb, rdv };
      })
    );
    // Serveur : groupe les ids par type
    const byKind: Record<PilotageType, string[]> = { TDB: [], RDV: [] };
    for (const id of ids) {
      const ctx = idToContext.get(id);
      if (ctx) byKind[ctx.kind].push(id);
    }
    startTransition(async () => {
      try {
        let updated = 0;
        for (const kind of ["TDB", "RDV"] as const) {
          const group = byKind[kind];
          if (group.length === 0) continue;
          const libelle = logique === "__reset__" ? null : libelleForLogique(kind, logique);
          const res = await bulkSetPilotageStatut(group, libelle, kind);
          updated += res.updated ?? 0;
        }
        if (updated > 0) toastSuccess(`${updated} cellule${updated > 1 ? "s" : ""} mise${updated > 1 ? "s" : ""} à jour`);
        clearSelection();
      } catch (e) {
        toastError(e, "Échec mise à jour groupée");
        router.refresh();
      }
    });
  }

  // Copy TSV : 1 ligne par cellule, valeur = libelle.
  function buildCopyText(ids: string[]): string {
    return ids
      .map((id) => {
        const ctx = idToContext.get(id);
        if (!ctx) return "";
        const r = localRows.find((x) => x.id === ctx.clientId);
        const sub = r && (ctx.kind === "TDB" ? r.tdb : r.rdv);
        return sub?.cells.get(ctx.periode)?.statut_detail ?? "";
      })
      .join("\n");
  }

  // Paste : on resout le libelle colle vers un statut LOGIQUE (les deux jeux
  // de libelles confondus), puis on applique le libelle correspondant au type
  // de chaque cellule cible -> coller un libelle TDB sur une cellule RDV marche.
  function applyPasteText(text: string, ids: string[]) {
    const lines2 = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines2.length === 0 || ids.length === 0) return;
    const toLogique = new Map<string, Logique>();
    for (const o of [...TDB_OPTIONS, ...RDV_OPTIONS]) toLogique.set(o.libelle.toLowerCase(), o.logique);

    // Group ids par logique cible
    const groups = new Map<Logique, string[]>();
    if (lines2.length === 1) {
      const lg = toLogique.get(lines2[0].trim().toLowerCase());
      if (!lg) return;
      groups.set(lg, ids);
    } else {
      for (let i = 0; i < ids.length && i < lines2.length; i++) {
        const lg = toLogique.get(lines2[i].trim().toLowerCase());
        if (!lg) continue;
        if (!groups.has(lg)) groups.set(lg, []);
        groups.get(lg)!.push(ids[i]);
      }
    }
    if (groups.size === 0) return;
    for (const [lg, groupIds] of groups) applyLogiqueToIds(groupIds, lg);
  }

  // Selection 2D Excel-style (hook partage).
  const {
    selectedIds,
    selectedCount,
    focusedPos,
    isSelected,
    onCellClick,
    clearSelection,
    selectAll,
    selectOne,
  } = useGridSelection(gridIds, {
    onCopy: (ids) => {
      const text = buildCopyText(ids);
      navigator.clipboard?.writeText?.(text).then(() => {
        toastSuccess(`${ids.length} cellule${ids.length > 1 ? "s" : ""} copiée${ids.length > 1 ? "s" : ""}`);
      }).catch(() => { /* ignore */ });
    },
    onPaste: (text, ids) => applyPasteText(text, ids),
  });

  function onBulkApply(key: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    applyLogiqueToIds(ids, key === "__reset__" ? "__reset__" : (key as Logique));
  }

  const years = [year - 1, year, year + 1];

  // ============================================================================
  //  Rendu
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* Filtres (gauche) + sélecteur année (droite) sur la MÊME ligne, pour
          éviter une bande vide. Le toggle TDB/RDV a disparu (fusion). */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <StatusFilterChip label="Tous" count={counts.total} active={filter.size === 0} onClick={() => setFilter(new Set())} />
          <StatusFilterChip label="À faire" count={counts.A_FAIRE} active={filter.has("A_FAIRE")} onClick={(e) => setFilter(toggleFilterKey(filter, "A_FAIRE", e))} accent="amber" />
          <StatusFilterChip label="En cours" count={counts.EN_COURS} active={filter.has("EN_COURS")} onClick={(e) => setFilter(toggleFilterKey(filter, "EN_COURS", e))} accent="sky" />
          <StatusFilterChip label="Terminé" count={counts.TERMINE} active={filter.has("TERMINE")} onClick={(e) => setFilter(toggleFilterKey(filter, "TERMINE", e))} accent="emerald" />
          {counts.NON_APPLICABLE > 0 && (
            <StatusFilterChip label="N/A" count={counts.NON_APPLICABLE} active={filter.has("NON_APPLICABLE")} onClick={(e) => setFilter(toggleFilterKey(filter, "NON_APPLICABLE", e))} />
          )}
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
          {years.map((y) => (
            <Link
              key={y}
              href={`/missions/pilotage?year=${y}`}
              aria-current={y === year ? "page" : undefined}
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
      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
          <p>Aucun dossier souscrit au pilotage pour l&apos;exercice {year}.</p>
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
            Active le suivi depuis la fiche client → onglet Obligations → carte « Pilotage ».
          </p>
        </div>
      ) : (
        <div
          style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
          className="rounded-xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto"
        >
          <table className="w-full text-sm min-w-[1150px]" aria-label="Suivi Pilotage">
            <thead className="bg-zinc-50/50 dark:bg-white/[0.02] border-b border-zinc-200/70 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 sticky left-0 bg-zinc-50/50 dark:bg-white/[0.02] min-w-[200px]">
                  Client
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[140px]">
                  Suivi
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[120px]">
                  Cadence
                </th>
                {MONTHS_SHORT.map((m, i) => (
                  <th key={i} scope="col" className="px-2 py-2 text-center font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[78px]">
                    {m}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            {filteredRows.map((r, ci) => (
              <tbody
                key={r.id}
                className={cn(ci > 0 && "border-t-[3px] border-zinc-200/80 dark:border-white/[0.08]")}
              >
                {(["TDB", "RDV"] as const).map((kind, ki) => {
                  const sub = kind === "TDB" ? r.tdb : r.rdv;
                  const lineIdx = ci * 2 + ki;
                  const cadOpts = cadenceLabels(kind);
                  const subscribed = sub.cells.size > 0;

                  // Urgence de la ligne (pire etat parmi ses cellules)
                  let rowUrgency: "none" | "due_soon" | "overdue" = "none";
                  for (const [periode, c] of sub.cells) {
                    const u = getUrgencyStatus(computeEcheancePilotage(periode), c.statut_logique);
                    if (u === "overdue") { rowUrgency = "overdue"; break; }
                    if (u === "due_soon") rowUrgency = "due_soon";
                  }

                  return (
                    <tr
                      key={kind}
                      className={cn(
                        "transition-colors hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]",
                        ki === 1 && "border-t border-dashed border-zinc-100 dark:border-white/[0.04]"
                      )}
                    >
                      {ki === 0 && (
                        <td
                          rowSpan={2}
                          className="px-3 py-2 align-top sticky left-0 bg-white dark:bg-[hsl(var(--card))]"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/clients/${r.slug}`}
                              className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-[hsl(var(--gold-dark))] dark:hover:text-[hsl(var(--gold))] transition-colors"
                            >
                              {r.denomination}
                            </Link>
                            {r.siren && (
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{r.siren}</div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Colonne "Suivi" : libellé du sous-suivi + pastille urgence */}
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-1.5">
                          {rowUrgency !== "none" && (
                            <span
                              aria-label={rowUrgency === "overdue" ? "En retard" : "À traiter"}
                              title={rowUrgency === "overdue" ? "Au moins une période en retard" : "Au moins une période à traiter"}
                              className={cn(
                                "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                                rowUrgency === "overdue" ? "bg-rose-500" : "bg-amber-500"
                              )}
                            />
                          )}
                          <span className={cn(
                            "text-[12px] font-medium",
                            kind === "TDB" ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-400"
                          )}>
                            {KIND_LABEL[kind]}
                          </span>
                        </div>
                      </td>

                      {!subscribed ? (
                        // Sous-suivi non souscrit : pas de cellules. Message discret.
                        <td colSpan={13} className="px-3 py-2 text-[12px] text-zinc-400 dark:text-zinc-500 italic">
                          Non souscrit à ce suivi
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2">
                            <select
                              value={sub.cadence ?? cadOpts.mensuel}
                              onChange={(e) => onSetCadence(r.id, kind, e.target.value)}
                              disabled={!canEditProduction}
                              aria-label={`Cadence ${KIND_LABEL[kind]} ${r.denomination}`}
                              className="px-1.5 py-0.5 rounded text-[12px] border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <option value={cadOpts.mensuel}>{cadOpts.mensuel}</option>
                              <option value={cadOpts.tri}>{cadOpts.tri}</option>
                            </select>
                          </td>
                          {MENSUEL_MONTHS.map((m, colIdx) => {
                            const periode = `${year}-${String(m).padStart(2, "0")}`;
                            const cell = sub.cells.get(periode);
                            const isTri = !!sub.cadence && sub.cadence.toLowerCase().startsWith("trim");
                            const isTrimestreColumn = isTri && TRIMESTRIEL_MONTHS.includes(m);
                            const cellTitle = isTrimestreColumn ? TRIMESTRE_LABEL[m] : undefined;
                            const cellId = cell?.id;
                            const selected = !!cellId && isSelected(cellId);
                            const focused = focusedPos?.row === lineIdx && focusedPos?.col === colIdx;
                            const urgency = cell
                              ? getUrgencyStatus(computeEcheancePilotage(periode), cell.statut_logique)
                              : "none";
                            return (
                              <td
                                key={m}
                                className={cn(
                                  "px-1 py-2 text-center align-middle transition-colors",
                                  isTrimestreColumn && "bg-zinc-50/40 dark:bg-white/[0.02]",
                                  cell && "cursor-pointer",
                                  selected && "bg-sky-50/80 dark:bg-sky-500/[0.12]",
                                  focused && "outline outline-2 outline-sky-500 dark:outline-sky-400 outline-offset-[-2px]"
                                )}
                                title={cellTitle}
                                onClick={(e) => {
                                  if (!cellId) return;
                                  const target = e.target as HTMLElement;
                                  if (target.closest("button, a, input, [role='listbox'], [role='dialog']")) {
                                    selectOne(cellId);
                                    return;
                                  }
                                  onCellClick(lineIdx, colIdx, e);
                                }}
                              >
                                {cell ? (
                                  <div className="relative inline-block">
                                    {urgency !== "none" && (
                                      <span
                                        aria-label={urgency === "overdue" ? "En retard" : "Échéance proche"}
                                        title={urgency === "overdue" ? "En retard" : "Échéance proche"}
                                        className={cn(
                                          "absolute -top-0.5 -right-0.5 z-10 w-1.5 h-1.5 rounded-full ring-2 ring-white dark:ring-[hsl(var(--card))] pointer-events-none",
                                          urgency === "overdue" ? "bg-rose-500" : "bg-amber-500"
                                        )}
                                      />
                                    )}
                                    {urgency === "overdue" && (
                                      <span
                                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-10 text-[8px] leading-none font-bold tracking-wider uppercase px-1 py-0.5 rounded bg-rose-500 text-white pointer-events-none whitespace-nowrap"
                                        aria-hidden
                                      >
                                        Retard
                                      </span>
                                    )}
                                    <Picker
                                      value={cell.statut_detail}
                                      options={optionsFor(kind).map((o) => ({
                                        key: o.libelle,
                                        label: o.libelle,
                                        color: o.color,
                                      }))}
                                      onChange={(libelle) => onSetStatut(r.id, kind, periode, libelle)}
                                      onReset={() => onSetStatut(r.id, kind, periode, null)}
                                      allowEmpty
                                      disabled={!canEditProduction}
                                      align="center"
                                      size="xs"
                                      minWidth={200}
                                    />
                                  </div>
                                ) : (
                                  <span className="inline-block w-6 h-6 rounded border border-dashed border-zinc-200 dark:border-white/[0.06]" />
                                )}
                              </td>
                            );
                          })}
                        </>
                      )}

                      {ki === 0 && (
                        <td rowSpan={2} className="px-2 py-2 text-right align-top">
                          <Link
                            href={`/clients/${r.slug}`}
                            className="inline-flex items-center justify-center p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-[hsl(var(--gold-dark))] dark:hover:text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/10 transition-colors"
                            aria-label={`Ouvrir ${r.denomination}`}
                            title="Ouvrir la fiche"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {filteredRows.length} dossier{filteredRows.length > 1 ? "s" : ""} affiché{filteredRows.length > 1 ? "s" : ""}
            {filter.size > 0 && ` (filtre : ${Array.from(filter).join(", ")})`}
            {sortedRows.length !== filteredRows.length && ` sur ${sortedRows.length} au total`}. Chaque client a 2 lignes : Tableau de bord et RDV Expert.
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Cadence trimestrielle : le statut est porté sur le dernier mois du trimestre (<span className="font-medium">Mars</span> = T1, <span className="font-medium">Juin</span> = T2, <span className="font-medium">Septembre</span> = T3, <span className="font-medium">Décembre</span> = T4). Échéance de livraison au mois suivant.
          </p>
        </div>
        {filteredRows.length > 0 && (
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            Tout sélectionner
          </button>
        )}
      </div>

      {/* Barre bulk : applique un statut LOGIQUE, résolu par type de cellule */}
      <BulkActionBar
        count={selectedCount}
        onClear={clearSelection}
        disabled={!canEditProduction}
        columnLabel="Statut"
        options={[
          { key: "A_FAIRE", label: "À faire", color: TDB_OPTIONS[0].color },
          { key: "EN_COURS", label: "En cours", color: TDB_OPTIONS[1].color },
          { key: "TERMINE", label: "Terminé", color: TDB_OPTIONS[2].color },
          { key: "NON_APPLICABLE", label: "N/A", color: TDB_OPTIONS[3].color },
          { key: "__reset__", label: "Réinitialiser (À faire)", color: "bg-zinc-50 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10]" },
        ]}
        onApply={onBulkApply}
      />
    </div>
  );
}
