"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { BulkActionBar } from "@/app/_components/bulk-action-bar";
import { StatusFilterChip } from "@/app/_components/status-filter-chip";
import { toggleFilterKey } from "@/app/_components/filter-multi-select";
import { Picker } from "@/app/_components/picker";
import { useLocalStorageSet } from "@/app/_components/use-local-storage-pref";
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
// Trimestriel : cellule sur le dernier mois du trimestre (= periode couverte).
// Mars=T1, Juin=T2, Septembre=T3, Decembre=T4. Echeances de livraison au mois
// suivant (Avr/Juil/Oct/Janv+1) - donnees dans le tooltip.
const TRIMESTRIEL_MONTHS = [3, 6, 9, 12];
const TRIMESTRE_LABEL: Record<number, string> = {
  3: "T1 · Janv-Fév-Mars (livraison avril)",
  6: "T2 · Avr-Mai-Juin (livraison juillet)",
  9: "T3 · Juil-Août-Sept (livraison octobre)",
  12: "T4 · Oct-Nov-Déc (livraison janvier N+1)",
};

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
  // Set vide = "Tous". Cmd/Ctrl+clic = toggle. Persiste dans localStorage.
  type StatusGroup = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";
  const [filter, setFilter] = useLocalStorageSet<StatusGroup>(
    `moon.pilotage.${type}.statusFilter`,
    new Set(),
    (k): k is StatusGroup =>
      k === "A_FAIRE" || k === "EN_COURS" || k === "TERMINE" || k === "NON_APPLICABLE",
  );

  const STATUS_OPTIONS = type === "TDB" ? TDB_OPTIONS : RDV_OPTIONS;
  const cadenceLabel = type === "TDB" ? "Mensuelle" : "Mensuel";
  const cadenceLabelTri = type === "TDB" ? "Trimestrielle" : "Trimestriel";

  // Tri par denomination. Tous les rows sont souscrits (filtre cote server).
  const sortedRows = useMemo(
    () => localRows.slice().sort((a, b) => a.denomination.localeCompare(b.denomination, "fr")),
    [localRows]
  );

  // Compteurs par statut (sur toutes les cellules de tous les rows)
  const counts = useMemo(() => {
    const c = { total: 0, A_FAIRE: 0, EN_COURS: 0, TERMINE: 0, NON_APPLICABLE: 0 };
    for (const r of localRows) {
      for (const cell of r.cells.values()) {
        c.total++;
        c[cell.statut_logique]++;
      }
    }
    return c;
  }, [localRows]);

  // Filtre rows : si statusFilter actif, on garde les rows qui ont au moins
  // une cellule du statut selectionne.
  const filteredRows = useMemo(() => {
    if (filter.size === 0) return sortedRows;
    return sortedRows.filter((r) => {
      for (const cell of r.cells.values()) {
        if (filter.has(cell.statut_logique as StatusGroup)) return true;
      }
      return false;
    });
  }, [sortedRows, filter]);

  // ============================================================================
  //  Selection Excel-style avec navigation 2D (row, col)
  // ============================================================================
  // Grille 2D : gridIds[row][col] = cellId ou null. row = index dans
  // filteredRows. col = 0-11 (Janv-Dec). Permet la navigation ↑↓←→ qui
  // saute les cellules vides (mois sans periodicite).
  const gridIds: (string | null)[][] = useMemo(() => {
    return filteredRows.map((r) =>
      MENSUEL_MONTHS.map((m) => {
        const periode = `${year}-${String(m).padStart(2, "0")}`;
        const cell = r.cells.get(periode);
        return cell && !cell.id.startsWith("optimistic-") ? cell.id : null;
      })
    );
  }, [filteredRows, year]);

  // Lookup inverse cellId -> (row, col) pour onClick + bulk
  const posByCellId = useMemo(() => {
    const m = new Map<string, { row: number; col: number }>();
    gridIds.forEach((rowArr, r) => {
      rowArr.forEach((id, c) => {
        if (id) m.set(id, { row: r, col: c });
      });
    });
    return m;
  }, [gridIds]);

  // Map cellId -> { rowId, periode } pour les bulk operations
  const idToContext = useMemo(() => {
    const m = new Map<string, { rowId: string; periode: string }>();
    for (const r of localRows) {
      for (const [periode, cell] of r.cells) {
        m.set(cell.id, { rowId: r.id, periode });
      }
    }
    return m;
  }, [localRows]);

  // State selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedPos, setFocusedPos] = useState<{ row: number; col: number } | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ row: number; col: number } | null>(null);
  const selectedCount = selectedIds.size;

  // Clean up selection si les cellules disparaissent (changement de filtre/annee)
  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set<string>();
      gridIds.forEach((row) => row.forEach((id) => { if (id) valid.add(id); }));
      const next = new Set<string>();
      let changed = false;
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    setFocusedPos((prev) => {
      if (!prev) return prev;
      if (prev.row >= gridIds.length || prev.col < 0 || prev.col >= 12) return null;
      return prev;
    });
  }, [gridIds]);

  const isSelected = (cellId: string) => selectedIds.has(cellId);

  function clearSelection() {
    setSelectedIds(new Set());
    setFocusedPos(null);
    setAnchorPos(null);
  }

  function selectAll() {
    const all = new Set<string>();
    gridIds.forEach((row) => row.forEach((id) => { if (id) all.add(id); }));
    setSelectedIds(all);
    // Set focus sur la 1ere cellule non-null
    for (let r = 0; r < gridIds.length; r++) {
      for (let c = 0; c < 12; c++) {
        if (gridIds[r][c]) {
          setFocusedPos({ row: r, col: c });
          setAnchorPos({ row: r, col: c });
          return;
        }
      }
    }
  }

  // Range rectangulaire entre 2 positions (ancre <-> cible). Inclut TOUS
  // les cellIds non-null dans le rectangle.
  function rangeIds(a: { row: number; col: number }, b: { row: number; col: number }): Set<string> {
    const rMin = Math.min(a.row, b.row);
    const rMax = Math.max(a.row, b.row);
    const cMin = Math.min(a.col, b.col);
    const cMax = Math.max(a.col, b.col);
    const ids = new Set<string>();
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const id = gridIds[r]?.[c];
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  // Click sur une cellule : shift = range, cmd = toggle, simple = selection
  function onCellClick(row: number, col: number, e: React.MouseEvent) {
    const cellId = gridIds[row]?.[col];
    if (!cellId) return;
    if (e.shiftKey && anchorPos) {
      setSelectedIds(rangeIds(anchorPos, { row, col }));
      setFocusedPos({ row, col });
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(cellId)) next.delete(cellId);
        else next.add(cellId);
        return next;
      });
      setFocusedPos({ row, col });
      setAnchorPos({ row, col });
      return;
    }
    setSelectedIds(new Set([cellId]));
    setFocusedPos({ row, col });
    setAnchorPos({ row, col });
  }

  // Trouve la prochaine position non-null dans une direction donnee, en
  // sautant les cellules vides. Retourne null si on sort de la grille.
  function nextPos(
    from: { row: number; col: number },
    direction: "up" | "down" | "left" | "right"
  ): { row: number; col: number } | null {
    const dr = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    const dc = direction === "left" ? -1 : direction === "right" ? 1 : 0;
    let r = from.row + dr;
    let c = from.col + dc;
    while (r >= 0 && r < gridIds.length && c >= 0 && c < 12) {
      if (gridIds[r][c]) return { row: r, col: c };
      r += dr;
      c += dc;
    }
    return null;
  }

  // Copy TSV : 1 ligne par cellule, valeur = libelle
  function buildCopyText(ids: string[]): string {
    return ids
      .map((id) => {
        const ctx = idToContext.get(id);
        if (!ctx) return "";
        const r = localRows.find((x) => x.id === ctx.rowId);
        const cell = r?.cells.get(ctx.periode);
        return cell?.statut_detail ?? "";
      })
      .join("\n");
  }

  // Paste TSV : 1 valeur -> fill-all selected | N valeurs -> positional
  function applyPasteText(text: string, ids: string[]) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0 || ids.length === 0) return;
    const byLabel = new Map<string, string | null>();
    for (const opt of STATUS_OPTIONS) byLabel.set(opt.libelle.toLowerCase(), opt.libelle);

    // Group : libelle -> [ids]
    const updates = new Map<string | null, string[]>();
    if (lines.length === 1) {
      const target = byLabel.get(lines[0].trim().toLowerCase());
      if (target === undefined) return;
      updates.set(target, ids);
    } else {
      for (let i = 0; i < ids.length && i < lines.length; i++) {
        const target = byLabel.get(lines[i].trim().toLowerCase());
        if (target === undefined) continue;
        if (!updates.has(target)) updates.set(target, []);
        updates.get(target)!.push(ids[i]);
      }
    }
    if (updates.size === 0) return;

    // Optimistic
    setLocalRows((prev) =>
      prev.map((r) => {
        const newCells = new Map(r.cells);
        for (const [libelle, idsList] of updates) {
          for (const id of idsList) {
            const ctx = idToContext.get(id);
            if (!ctx || ctx.rowId !== r.id) continue;
            const cell = newCells.get(ctx.periode);
            if (!cell) continue;
            const opt = STATUS_OPTIONS.find((o) => o.libelle === libelle);
            newCells.set(ctx.periode, {
              ...cell,
              statut_logique: opt?.logique ?? "A_FAIRE",
              statut_detail: libelle ?? (type === "TDB" ? "À préparer" : "RDV à planifier"),
            });
          }
        }
        return { ...r, cells: newCells };
      })
    );
    startTransition(async () => {
      try {
        let totalUpdated = 0;
        for (const [libelle, idsList] of updates) {
          const res = await bulkSetPilotageStatut(idsList, libelle, type);
          totalUpdated += res.updated;
        }
        toastSuccess(`${totalUpdated} cellule${totalUpdated > 1 ? "s" : ""} mise${totalUpdated > 1 ? "s" : ""} à jour`);
        clearSelection();
      } catch (e) {
        toastError(e, "Échec collage");
        router.refresh();
      }
    });
  }

  // Listener doc global : flèches 2D, Cmd+A, Cmd+C/V, Esc.
  // Plus fiable que onKeyDown sur la table : marche peu importe ou est le
  // focus DOM (le focus part sur le button picker quand on clique).
  useEffect(() => {
    function onDocKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      // Si un popover picker est ouvert, on lui laisse les flèches
      if (document.querySelector("[role='listbox']") &&
          (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        return;
      }

      // Esc -> vide la SELECTION mais garde focusedPos / anchorPos pour
      // pouvoir continuer a naviguer avec les fleches (sinon Esc = fleches
      // mortes, frustrant).
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
        return;
      }

      const meta = e.metaKey || e.ctrlKey;

      // Cmd+A : tout selectionner
      if (meta && e.key.toLowerCase() === "a" && gridIds.length > 0) {
        e.preventDefault();
        selectAll();
        return;
      }

      // Cmd+C : copy
      if (meta && e.key.toLowerCase() === "c" && selectedIds.size > 0) {
        const ids = Array.from(selectedIds);
        const text = buildCopyText(ids);
        navigator.clipboard?.writeText?.(text).then(() => {
          toastSuccess(`${ids.length} cellule${ids.length > 1 ? "s" : ""} copiée${ids.length > 1 ? "s" : ""}`);
        }).catch(() => { /* ignore */ });
        return;
      }

      // Cmd+V : paste
      if (meta && e.key.toLowerCase() === "v" && selectedIds.size > 0) {
        e.preventDefault();
        navigator.clipboard?.readText?.().then((text) => {
          if (text) applyPasteText(text, Array.from(selectedIds));
        }).catch(() => { /* ignore */ });
        return;
      }

      // Fleches : navigation 2D (skip cellules vides). Requiert focusedPos.
      if (!focusedPos) return;
      let dir: "up" | "down" | "left" | "right" | null = null;
      if (e.key === "ArrowUp") dir = "up";
      else if (e.key === "ArrowDown") dir = "down";
      else if (e.key === "ArrowLeft") dir = "left";
      else if (e.key === "ArrowRight") dir = "right";
      if (!dir) return;
      e.preventDefault();
      const next = nextPos(focusedPos, dir);
      if (!next) return;
      const nextId = gridIds[next.row][next.col];
      if (!nextId) return;

      if (e.shiftKey && anchorPos) {
        // Étend la sélection depuis l'ancre
        setSelectedIds(rangeIds(anchorPos, next));
      } else {
        setSelectedIds(new Set([nextId]));
        setAnchorPos(next);
      }
      setFocusedPos(next);
    }
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPos, anchorPos, selectedIds, gridIds]);

  function onBulkApply(libelleKey: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const libelle = libelleKey === "__reset__" ? null : libelleKey;

    // Optimistic
    const opt = libelle ? STATUS_OPTIONS.find((o) => o.libelle === libelle) : null;
    setLocalRows((prev) =>
      prev.map((r) => {
        const newCells = new Map(r.cells);
        for (const [periode, cell] of newCells) {
          if (selectedIds.has(cell.id)) {
            newCells.set(periode, {
              ...cell,
              statut_logique: opt?.logique ?? "A_FAIRE",
              statut_detail: libelle ?? (type === "TDB" ? "À préparer" : "RDV à planifier"),
            });
          }
        }
        return { ...r, cells: newCells };
      })
    );
    startTransition(async () => {
      try {
        const res = await bulkSetPilotageStatut(ids, libelle, type);
        if (!res.ok) {
          toastError(new Error(res.error ?? "Erreur"), "Échec mise à jour groupée");
          router.refresh();
          return;
        }
        toastSuccess(`${res.updated} cellule${res.updated > 1 ? "s" : ""} mise${res.updated > 1 ? "s" : ""} à jour`);
        clearSelection();
      } catch (e) {
        toastError(e, "Échec mise à jour groupée");
        router.refresh();
      }
    });
  }

  // ============================================================================
  //  Actions
  // ============================================================================

  function onSetCadence(clientId: string, value: string) {
    // Optimistic
    setLocalRows((prev) => prev.map((r) => (r.id === clientId ? { ...r, cadence: value } : r)));
    startTransition(async () => {
      // Cadence par annee (cf. migration 0063) - on passe l'annee active.
      const res = await setPilotageCadence(
        clientId,
        year,
        type === "TDB" ? "tdb" : "rdv",
        value as Parameters<typeof setPilotageCadence>[3]
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

      {/* Filtres chips : Tous / À faire / En cours / Terminé / N/A */}
      <div className="flex items-center gap-1 flex-wrap">
        <StatusFilterChip label="Tous" count={counts.total} active={filter.size === 0} onClick={() => setFilter(new Set())} />
        <StatusFilterChip label="À faire" count={counts.A_FAIRE} active={filter.has("A_FAIRE")} onClick={(e) => setFilter(toggleFilterKey(filter, "A_FAIRE", e))} accent="amber" />
        <StatusFilterChip label="En cours" count={counts.EN_COURS} active={filter.has("EN_COURS")} onClick={(e) => setFilter(toggleFilterKey(filter, "EN_COURS", e))} accent="sky" />
        <StatusFilterChip label="Terminé" count={counts.TERMINE} active={filter.has("TERMINE")} onClick={(e) => setFilter(toggleFilterKey(filter, "TERMINE", e))} accent="emerald" />
        {counts.NON_APPLICABLE > 0 && (
          <StatusFilterChip label="N/A" count={counts.NON_APPLICABLE} active={filter.has("NON_APPLICABLE")} onClick={(e) => setFilter(toggleFilterKey(filter, "NON_APPLICABLE", e))} />
        )}
      </div>

      {/* Table */}
      {filteredRows.length === 0 ? (
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
              {filteredRows.map((r, rowIdx) => {
                // Pastille rouge a la racine du dossier si au moins une cellule
                // est en A_FAIRE pour l'annee active. Coherent avec IR/CAA/Creations.
                const hasAFaire = Array.from(r.cells.values()).some(
                  (c) => c.statut_logique === "A_FAIRE"
                );
                return (
                  <tr key={r.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-[hsl(var(--card))]">
                      <div className="flex items-start gap-2">
                        {hasAFaire && (
                          <span
                            aria-label="À faire"
                            title="Au moins une période à traiter"
                            className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/clients/${r.slug}`}
                            className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                          >
                            {r.denomination}
                          </Link>
                          {r.siren && (
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{r.siren}</div>
                          )}
                        </div>
                      </div>
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
                    {MENSUEL_MONTHS.map((m, colIdx) => {
                      const periode = `${year}-${String(m).padStart(2, "0")}`;
                      const cell = r.cells.get(periode);
                      const isTri = !!r.cadence && r.cadence.toLowerCase().startsWith("trim");
                      const isTrimestreColumn = isTri && TRIMESTRIEL_MONTHS.includes(m);
                      const cellTitle = isTrimestreColumn ? TRIMESTRE_LABEL[m] : undefined;
                      const cellId = cell?.id;
                      const selected = !!cellId && isSelected(cellId);
                      const focused = focusedPos?.row === rowIdx && focusedPos?.col === colIdx;
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
                            // Clic sur la cellule (mais pas sur le picker) =
                            // sélectionne + focus. Le picker s'ouvre par clic
                            // explicit sur son button.
                            if (!cellId) return;
                            const target = e.target as HTMLElement;
                            if (target.closest("button, a, input, [role='listbox'], [role='dialog']")) {
                              // Clic sur le button picker : on selectionne quand meme
                              // (pour que le bulk fonctionne) mais on n'empeche pas
                              // l'ouverture du picker.
                              setSelectedIds(new Set([cellId]));
                              setFocusedPos({ row: rowIdx, col: colIdx });
                              setAnchorPos({ row: rowIdx, col: colIdx });
                              return;
                            }
                            onCellClick(rowIdx, colIdx, e);
                          }}
                        >
                          {cell ? (
                            <Picker
                              value={cell.statut_detail}
                              options={STATUS_OPTIONS.map((o) => ({
                                key: o.libelle,
                                label: o.libelle,
                                color: o.color,
                              }))}
                              onChange={(libelle) => onSetStatut(r.id, periode, libelle)}
                              onReset={() => onSetStatut(r.id, periode, null)}
                              allowEmpty
                              align="center"
                              size="xs"
                              minWidth={200}
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

      <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {filteredRows.length} dossier{filteredRows.length > 1 ? "s" : ""} affiché{filteredRows.length > 1 ? "s" : ""}
            {filter.size > 0 && ` (filtre : ${Array.from(filter).join(", ")})`}
            {sortedRows.length !== filteredRows.length && ` sur ${sortedRows.length} au total`}.
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Cadence trimestrielle : le statut est porté sur le dernier mois du trimestre (<span className="font-medium">Mars</span> = T1, <span className="font-medium">Juin</span> = T2, <span className="font-medium">Septembre</span> = T3, <span className="font-medium">Décembre</span> = T4). Échéance de livraison au mois suivant (avril, juillet, octobre, janvier N+1).
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

      {/* Barre bulk : sticky en bas, visible si selection > 0 */}
      <BulkActionBar
        count={selectedCount}
        onClear={clearSelection}
        hint="clic + shift / cmd · ↑↓ flèches · Cmd+A/C/V"
        options={[
          ...STATUS_OPTIONS.map((o) => ({ key: o.libelle, label: o.libelle, color: o.color })),
          { key: "__reset__", label: "Réinitialiser (À faire)", color: "bg-zinc-50 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10]" },
        ]}
        onApply={onBulkApply}
      />
    </div>
  );
}

