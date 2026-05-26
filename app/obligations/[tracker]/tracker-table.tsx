"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { cn, fmtDateFr, statutColorClass } from "@/lib/utils";
import { PappersInpiBadges } from "@/lib/pappers-badges";
import {
  bulkUpdateObligationStatus,
  updateObligationStatus,
} from "../actions";
import CommentsPopover from "./comments-panel";

type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

export type StatusOption = {
  libelle: string;
  statut_logique: StatutLogique;
  color: string | null;
};

export type TrackerCell = {
  colKey: string;
  obligationId: string | null;
  type: string;
  statut_logique: StatutLogique | null;
  statut_detail: string | null;
  echeance: string | null;
  note: string | null;
};

export type TrackerRow = {
  clientId: string;
  clientSlug: string;
  denomination: string;
  siren: string | null;
  pipeline: string | null;
  origine: string | null;
  cells: TrackerCell[];
};

type StatutFilter = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

export default function TrackerTable({
  rows,
  cols,
  statusOptions,
  focus,
  initialCommentCounts,
  currentUserEmail,
}: {
  rows: TrackerRow[];
  cols: Array<{ key: string; label: string; type: string; periode: string }>;
  statusOptions: Record<string, StatusOption[]>;
  focus?: string | null;
  initialCommentCounts: Record<string, number>;
  currentUserEmail: string | null;
}) {
  const [search, setSearch] = useState("");
  const [openCellId, setOpenCellId] = useState<string | null>(null);
  const [highlightedCellId, setHighlightedCellId] = useState<string | null>(null);
  // Commentaires : compteur par obligation_id (server-loaded initial, MAJ
  // optimiste via panel). + ID de l'obligation pour laquelle le panel est ouvert.
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    initialCommentCounts ?? {}
  );
  const [openCommentsObligId, setOpenCommentsObligId] = useState<string | null>(null);
  const [openCommentsLabel, setOpenCommentsLabel] = useState<string>("");
  // Rect d'ancrage du popover commentaires (capturé au clic sur 💬)
  const [openCommentsAnchor, setOpenCommentsAnchor] = useState<
    { left: number; top: number; bottom: number; right: number } | null
  >(null);
  const [statusFilter, setStatusFilter] = useState<Set<StatutFilter>>(new Set());
  const [periodFilter, setPeriodFilter] = useState<Set<string>>(new Set());
  // Largeur auto-fit pour les colonnes (sinon min-w-[120px] par défaut)
  const [autoFit, setAutoFit] = useState(false);
  // Sélection multi-cellules (set d'obligationIds)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(null);
  // Presse-papier client en grille (style Excel) :
  // une matrice rows × cols où chaque case est { libelle } ou null si vide.
  type ClipCell = { libelle: string; color: string | null } | null;
  const [clipboard, setClipboard] = useState<{
    grid: ClipCell[][];
    rows: number;
    cols: number;
  } | null>(null);
  const [, startTransition] = useTransition();
  const tableRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // State local + sync via prop. useOptimistic ne joue pas bien avec
  // router.refresh() (revert à la fin de la transition, le refresh n'a pas
  // forcément propagé la donnée serveur). Le state local reste correct et
  // le useEffect re-sync quand les props arrivent.
  type Patch = {
    obligationId: string;
    statut_logique?: StatutLogique;
    statut_detail?: string | null;
    note?: string | null;
  };
  const [localRows, setLocalRows] = useState<TrackerRow[]>(rows);
  useEffect(() => setLocalRows(rows), [rows]);

  // Stable (useCallback) pour que les callbacks qui en dépendent (onPick) le
  // restent eux aussi, et que StatusCell mémo continue de fonctionner.
  const applyPatch = useCallback((patch: Patch) => {
    setLocalRows((state) =>
      state.map((r) => ({
        ...r,
        cells: r.cells.map((c) =>
          c.obligationId === patch.obligationId
            ? {
                ...c,
                statut_logique: patch.statut_logique !== undefined ? patch.statut_logique : c.statut_logique,
                statut_detail: patch.statut_detail !== undefined ? patch.statut_detail : c.statut_detail,
                note: patch.note !== undefined ? patch.note : c.note,
              }
            : c
        ),
      }))
    );
  }, []);

  // Résolution du focus (`clientId_TYPE_periode`) -> cellId (`clientId|colKey`)
  useEffect(() => {
    if (!focus) return;
    const parts = focus.split("_");
    if (parts.length < 3) return;
    const clientId = parts[0];
    // Le type peut contenir des underscores (TVA_MENSUELLE), donc on
    // récupère la dernière partie comme periode et le milieu comme type.
    // Cas simples : periode contient un tiret (YYYY-MM, T1-YYYY, A-MM-YYYY,
    // S-YYYY). On scinde au dernier underscore qui sépare type/periode.
    const lastUnderscore = focus.lastIndexOf("_");
    const periode = focus.slice(lastUnderscore + 1);
    const type = focus.slice(clientId.length + 1, lastUnderscore);

    // Cherche la colonne dont (type, periode) match
    const col = cols.find((c) => c.type === type && c.periode === periode);
    if (!col) return;
    const cellId = `${clientId}|${col.key}`;
    setOpenCellId(cellId);
    setHighlightedCellId(cellId);
    // Scroll into view après le render
    requestAnimationFrame(() => {
      const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell-id="${cellId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    });
    // Retire le highlight après quelques secondes
    const t = setTimeout(() => setHighlightedCellId(null), 3500);
    return () => clearTimeout(t);
  }, [focus, cols]);

  // Colonnes visibles d'après le filtre période (vide = toutes)
  const visibleCols = useMemo(
    () => (periodFilter.size > 0 ? cols.filter((c) => periodFilter.has(c.key)) : cols),
    [cols, periodFilter]
  );

  // Set pour lookups O(1) sur les colKey visibles. Évite des
  // `visibleCols.some(vc => vc.key === c.colKey)` répétés (O(n²) sur 790 cells).
  const visibleColKeysSet = useMemo(
    () => new Set(visibleCols.map((c) => c.key)),
    [visibleCols]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const hasStatusFilter = statusFilter.size > 0;
    return localRows.filter((r) => {
      if (s) {
        const hay = `${r.denomination} ${r.siren ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      // Filtre statut : au moins une cellule visible (= dans visibleColKeysSet)
      // remplie correspond
      if (hasStatusFilter) {
        const has = r.cells.some(
          (c) =>
            c.obligationId &&
            c.statut_logique &&
            visibleColKeysSet.has(c.colKey) &&
            statusFilter.has(c.statut_logique as StatutFilter)
        );
        if (!has) return false;
      }
      return true;
    });
  }, [localRows, search, statusFilter, visibleColKeysSet]);

  // Bornes nav (déclarées tôt pour être dispo dans tous les hooks/handlers)
  const maxRow = filtered.length - 1;
  const maxCol = visibleCols.length - 1;

  function toggleStatusFilter(s: StatutFilter) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // Récupère l'obligationId d'une cellule (row, col)
  function obligationIdAt(row: number, col: number): string | null {
    const td = tableRef.current?.querySelector<HTMLElement>(
      `td[data-row-index="${row}"][data-col-index="${col}"]`
    );
    return td?.dataset.obligationId ?? null;
  }

  // Sélectionne une plage rectangulaire (ancre -> (row, col))
  function selectRange(toRow: number, toCol: number) {
    if (!anchor) return;
    const rMin = Math.min(anchor.row, toRow);
    const rMax = Math.max(anchor.row, toRow);
    const cMin = Math.min(anchor.col, toCol);
    const cMax = Math.max(anchor.col, toCol);
    const next = new Set<string>();
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const id = obligationIdAt(r, c);
        if (id) next.add(id);
      }
    }
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setAnchor(null);
  }

  // Sélection ligne entière
  function selectRow(rowIndex: number, e?: React.MouseEvent) {
    const ids: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const id = obligationIdAt(rowIndex, c);
      if (id) ids.push(id);
    }
    if (e?.metaKey || e?.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    } else if (e?.shiftKey && anchor) {
      // Étend la sélection actuelle pour englober [anchor.row .. rowIndex]
      const rMin = Math.min(anchor.row, rowIndex);
      const rMax = Math.max(anchor.row, rowIndex);
      const next = new Set<string>();
      for (let r = rMin; r <= rMax; r++) {
        for (let c = 0; c <= maxCol; c++) {
          const id = obligationIdAt(r, c);
          if (id) next.add(id);
        }
      }
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set(ids));
      setAnchor({ row: rowIndex, col: 0 });
    }
  }

  // Sélection colonne entière
  function selectColumn(colIndex: number, e?: React.MouseEvent) {
    const ids: string[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const id = obligationIdAt(r, colIndex);
      if (id) ids.push(id);
    }
    if (e?.metaKey || e?.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    } else if (e?.shiftKey && anchor) {
      const cMin = Math.min(anchor.col, colIndex);
      const cMax = Math.max(anchor.col, colIndex);
      const next = new Set<string>();
      for (let r = 0; r <= maxRow; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const id = obligationIdAt(r, c);
          if (id) next.add(id);
        }
      }
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set(ids));
      setAnchor({ row: 0, col: colIndex });
    }
  }

  // Donne la liste des cellules visibles d'une ligne (post-filtre période)
  function visibleCellsOf(rowIndex: number) {
    const r = filtered[rowIndex];
    if (!r) return [];
    return r.cells.filter((c) => visibleColKeysSet.has(c.colKey));
  }

  // Capture la sélection courante sous forme de grille (style Excel)
  function buildClipboardGrid(): { grid: ClipCell[][]; rows: number; cols: number } | null {
    if (selectedIds.size === 0) return null;
    let minRow = Infinity, maxR = -Infinity, minCol = Infinity, maxC = -Infinity;
    filtered.forEach((row, rowIndex) => {
      const visCells = row.cells.filter((cc) => visibleColKeysSet.has(cc.colKey));
      visCells.forEach((cell, colIndex) => {
        if (cell.obligationId && selectedIds.has(cell.obligationId)) {
          if (rowIndex < minRow) minRow = rowIndex;
          if (rowIndex > maxR) maxR = rowIndex;
          if (colIndex < minCol) minCol = colIndex;
          if (colIndex > maxC) maxC = colIndex;
        }
      });
    });
    if (minRow === Infinity) return null;
    const grid: ClipCell[][] = [];
    for (let r = minRow; r <= maxR; r++) {
      const line: ClipCell[] = [];
      const visCells = visibleCellsOf(r);
      for (let c = minCol; c <= maxC; c++) {
        const cell = visCells[c];
        if (cell?.obligationId && selectedIds.has(cell.obligationId) && cell.statut_detail) {
          const opt = (statusOptions[cell.type] ?? []).find((o) => o.libelle === cell.statut_detail);
          line.push({ libelle: cell.statut_detail, color: opt?.color ?? null });
        } else {
          line.push(null);
        }
      }
      grid.push(line);
    }
    return { grid, rows: maxR - minRow + 1, cols: maxC - minCol + 1 };
  }

  // Colle la grille du clipboard à partir d'une cellule ancre (anchorRow, anchorCol).
  // Cas particulier : si la grille est 1×1 ET qu'il y a plusieurs cellules
  // sélectionnées → colle la même valeur sur TOUTES les cellules sélectionnées
  // (comportement Excel "1 cellule → plusieurs"). Sinon, paste positionnel.
  function pasteClipboardAt(anchorRow: number, anchorCol: number) {
    if (!clipboard) return;
    const byLibelle = new Map<string, { ids: string[]; statut_logique: StatutLogique }>();

    const isSingleCell = clipboard.rows === 1 && clipboard.cols === 1;
    const single = isSingleCell ? clipboard.grid[0][0] : null;

    if (single && selectedIds.size > 1) {
      // Fill-all : applique la valeur à toutes les cellules sélectionnées
      for (const r of filtered) {
        for (const cc of r.cells) {
          if (!cc.obligationId || !selectedIds.has(cc.obligationId)) continue;
          const opt = (statusOptions[cc.type] ?? []).find((o) => o.libelle === single.libelle);
          if (!opt) continue;
          const e = byLibelle.get(single.libelle) ?? {
            ids: [],
            statut_logique: opt.statut_logique as StatutLogique,
          };
          e.ids.push(cc.obligationId);
          byLibelle.set(single.libelle, e);
        }
      }
    } else {
      // Paste positionnel (grille N×M depuis l'ancre)
      for (let r = 0; r < clipboard.rows; r++) {
        for (let c = 0; c < clipboard.cols; c++) {
          const v = clipboard.grid[r][c];
          if (!v) continue;
          const targetRow = anchorRow + r;
          const targetCol = anchorCol + c;
          if (targetRow > maxRow || targetCol > maxCol) continue;
          const visCells = visibleCellsOf(targetRow);
          const tc = visCells[targetCol];
          if (!tc?.obligationId) continue;
          const opt = (statusOptions[tc.type] ?? []).find((o) => o.libelle === v.libelle);
          if (!opt) continue;
          const e = byLibelle.get(v.libelle) ?? {
            ids: [],
            statut_logique: opt.statut_logique as StatutLogique,
          };
          e.ids.push(tc.obligationId);
          byLibelle.set(v.libelle, e);
        }
      }
    }

    if (byLibelle.size === 0) return;
    // Patch local immédiat (hors transition pour ne pas être perdu)
    for (const [libelle, { ids, statut_logique }] of byLibelle) {
      for (const id of ids) {
        applyPatch({ obligationId: id, statut_logique, statut_detail: libelle });
      }
    }
    startTransition(async () => {
      // Server : 1 appel par libellé
      await Promise.all(
        [...byLibelle].map(([libelle, { ids }]) =>
          bulkUpdateObligationStatus(ids, libelle)
        )
      );
      router.refresh();
    });
  }

  // Construit un TSV de la sélection (collable dans Excel)
  function buildSelectionTsv(): string {
    if (selectedIds.size === 0) return "";
    let minRow = Infinity, maxR = -Infinity, minCol = Infinity, maxC = -Infinity;
    filtered.forEach((row, rowIndex) => {
      const visCells = row.cells.filter((cc) => visibleColKeysSet.has(cc.colKey));
      visCells.forEach((cell, colIndex) => {
        if (cell.obligationId && selectedIds.has(cell.obligationId)) {
          if (rowIndex < minRow) minRow = rowIndex;
          if (rowIndex > maxR) maxR = rowIndex;
          if (colIndex < minCol) minCol = colIndex;
          if (colIndex > maxC) maxC = colIndex;
        }
      });
    });
    if (minRow === Infinity) return "";
    const lines: string[][] = [];
    const header: string[] = ["Client"];
    for (let c = minCol; c <= maxC; c++) header.push(visibleCols[c]?.label ?? "");
    lines.push(header);
    for (let r = minRow; r <= maxR; r++) {
      const row = filtered[r];
      const visCells = row.cells.filter((cc) => visibleColKeysSet.has(cc.colKey));
      const rowData: string[] = [row.denomination];
      for (let c = minCol; c <= maxC; c++) {
        const cell = visCells[c];
        const inSel = !!cell?.obligationId && selectedIds.has(cell.obligationId);
        rowData.push(inSel ? cell?.statut_detail ?? "" : "");
      }
      lines.push(rowData);
    }
    return lines.map((l) => l.join("\t")).join("\n");
  }

  // Coordonnées (row|col) des cellules sélectionnées — pour dessiner un seul
  // contour englobant à la Excel (au lieu d'un ring par cellule).
  const selectedCoords = useMemo(() => {
    const s = new Set<string>();
    filtered.forEach((row, rowIndex) => {
      const cells = row.cells.filter((c) => visibleColKeysSet.has(c.colKey));
      cells.forEach((cell, colIndex) => {
        if (cell.obligationId && selectedIds.has(cell.obligationId)) {
          s.add(`${rowIndex}|${colIndex}`);
        }
      });
    });
    return s;
  }, [filtered, visibleColKeysSet, selectedIds]);

  function selectAll() {
    const all = new Set<string>();
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const id = obligationIdAt(r, c);
        if (id) all.add(id);
      }
    }
    setSelectedIds(all);
  }

  // Raccourcis globaux (Escape, Cmd+Shift+L, Cmd+A, Cmd+C, Cmd+V) — fonctionnent
  // même si le focus n'est pas sur une cellule.
  useEffect(() => {
    function onWindowKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Ne pas intercepter si on est dans un input/textarea/select
      const isInput = target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );

      if (e.key === "Escape" && selectedIds.size > 0 && !openCellId) {
        clearSelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setSearch("");
        setStatusFilter(new Set());
        setPeriodFilter(new Set());
        return;
      }
      // Cmd/Ctrl+A : sélectionne tout, sauf si focus dans un input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !openCellId && !isInput) {
        e.preventDefault();
        const all = new Set<string>();
        for (let r = 0; r <= maxRow; r++) {
          for (let c = 0; c <= maxCol; c++) {
            const id = obligationIdAt(r, c);
            if (id) all.add(id);
          }
        }
        setSelectedIds(all);
        return;
      }
      // Cmd/Ctrl+C : copie la sélection (TSV + grille interne)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !openCellId && !isInput && selectedIds.size > 0) {
        e.preventDefault();
        const g = buildClipboardGrid();
        if (g) setClipboard(g);
        const tsv = buildSelectionTsv();
        if (tsv) navigator.clipboard?.writeText(tsv).catch(() => {});
        return;
      }
      // Cmd/Ctrl+V : colle la grille à partir de l'ancre courante (ou 1ère cellule sélectionnée)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !openCellId && !isInput && clipboard) {
        e.preventDefault();
        // Anchor = première cellule sélectionnée
        let anchorRow = -1;
        let anchorCol = -1;
        filtered.forEach((row, rowIndex) => {
          const visCells = visibleCellsOf(rowIndex);
          visCells.forEach((cell, colIndex) => {
            if (cell.obligationId && selectedIds.has(cell.obligationId)) {
              if (anchorRow === -1 || rowIndex < anchorRow || (rowIndex === anchorRow && colIndex < anchorCol)) {
                anchorRow = rowIndex;
                anchorCol = colIndex;
              }
            }
          });
        });
        if (anchorRow !== -1) pasteClipboardAt(anchorRow, anchorCol);
        return;
      }
    }
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, openCellId, clipboard, filtered, visibleCols]);

  // Navigation Excel-like : flèches déplacent le focus, Shift+Flèche étend la
  // sélection, Cmd+Shift+Flèche file au bord. Enter/Espace ouvre le picker,
  // Esc ferme et vide la sélection. Cmd+C copie le statut, Cmd+V colle.
  function onTableKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Escape global : vide la sélection (le picker se ferme déjà via StatusCell)
    if (e.key === "Escape" && selectedIds.size > 0 && !openCellId) {
      e.preventDefault();
      clearSelection();
      return;
    }

    // Cmd/Ctrl+A : sélectionne toutes les cellules visibles
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !openCellId) {
      e.preventDefault();
      const all = new Set<string>();
      for (let r = 0; r <= maxRow; r++) {
        for (let c = 0; c <= maxCol; c++) {
          const id = obligationIdAt(r, c);
          if (id) all.add(id);
        }
      }
      setSelectedIds(all);
      return;
    }

    if (openCellId) return;
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("button[data-cell-button]");
    if (!btn) return;
    const td = btn.closest<HTMLElement>("td[data-row-index]");
    if (!td) return;
    const row = parseInt(td.dataset.rowIndex || "0", 10);
    const col = parseInt(td.dataset.colIndex || "0", 10);

    // Cmd/Ctrl+C : copie la sélection comme grille (style Excel)
    //  - clipboard interne = grille structurée pour Coller positionnel
    //  - clipboard OS = TSV pour coller dans Excel
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      if (selectedIds.size > 0) {
        const g = buildClipboardGrid();
        if (g) setClipboard(g);
        const tsv = buildSelectionTsv();
        if (tsv) navigator.clipboard?.writeText(tsv).catch(() => {});
      } else {
        // Pas de sélection : copie la cellule focusée (1×1)
        const visCells = visibleCellsOf(row);
        const c = visCells[col];
        if (c?.statut_detail) {
          const opt = (statusOptions[c.type] ?? []).find((o) => o.libelle === c.statut_detail);
          setClipboard({
            grid: [[{ libelle: c.statut_detail, color: opt?.color ?? null }]],
            rows: 1,
            cols: 1,
          });
          navigator.clipboard?.writeText(c.statut_detail).catch(() => {});
        }
      }
      return;
    }

    // Cmd/Ctrl+V : colle la GRILLE à partir de la cellule focusée (top-left).
    // Si la grille est 3×4, on remplit 3 lignes × 4 colonnes vers le bas-droite.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
      if (!clipboard) return;
      e.preventDefault();
      pasteClipboardAt(row, col);
      return;
    }

    // Flèches : navigation / extension de sélection
    let nextRow = row;
    let nextCol = col;
    let toEdge = false;
    switch (e.key) {
      case "ArrowLeft":  nextCol -= 1; break;
      case "ArrowRight": nextCol += 1; break;
      case "ArrowUp":    nextRow -= 1; break;
      case "ArrowDown":  nextRow += 1; break;
      default: return;
    }
    if (e.metaKey || e.ctrlKey) toEdge = true;
    if (toEdge) {
      if (e.key === "ArrowLeft") nextCol = 0;
      else if (e.key === "ArrowRight") nextCol = maxCol;
      else if (e.key === "ArrowUp") nextRow = 0;
      else if (e.key === "ArrowDown") nextRow = maxRow;
    }
    nextRow = Math.max(0, Math.min(maxRow, nextRow));
    nextCol = Math.max(0, Math.min(maxCol, nextCol));

    e.preventDefault();

    if (e.shiftKey) {
      // Étend la sélection depuis l'ancre vers (nextRow, nextCol)
      if (!anchor) setAnchor({ row, col });
      const anchorRow = anchor?.row ?? row;
      const anchorCol = anchor?.col ?? col;
      const rMin = Math.min(anchorRow, nextRow);
      const rMax = Math.max(anchorRow, nextRow);
      const cMin = Math.min(anchorCol, nextCol);
      const cMax = Math.max(anchorCol, nextCol);
      const next = new Set<string>();
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const id = obligationIdAt(r, c);
          if (id) next.add(id);
        }
      }
      setSelectedIds(next);
    } else {
      // Pas de Shift : on vide la sélection multi-cellules (comportement Excel)
      // et l'ancre devient la nouvelle cellule focusée
      if (selectedIds.size > 0) setSelectedIds(new Set());
      setAnchor({ row: nextRow, col: nextCol });
    }

    // Toujours déplacer le focus
    const nextEl = tableRef.current?.querySelector<HTMLElement>(
      `td[data-row-index="${nextRow}"][data-col-index="${nextCol}"] button[data-cell-button]`
    );
    nextEl?.focus();
  }

  function onCellMouseDown(
    e: React.MouseEvent,
    obligationId: string | null,
    row: number,
    col: number
  ) {
    if (!obligationId) return;
    if (e.shiftKey) {
      e.preventDefault();
      if (!anchor) setAnchor({ row, col });
      selectRange(row, col);
    } else if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(obligationId)) next.delete(obligationId);
        else next.add(obligationId);
        return next;
      });
      setAnchor({ row, col });
    } else {
      // Plain click : on garde l'ancre mais on ne touche pas à la sélection ;
      // le onClick ouvrira le picker. Si une sélection existe, on la vide
      // pour éviter la confusion.
      setAnchor({ row, col });
      if (selectedIds.size > 0) setSelectedIds(new Set());
    }
  }

  // Bulk action : applique un libellé (ou null = reset) à la sélection
  function runBulk(obligationIds: string[], libelle: string | null) {
    if (obligationIds.length === 0) return;
    // Optimistic : applique le patch à chaque cellule. Pour libelle=null on
    // ne sait pas le défaut par type, on laisse le serveur trancher (on
    // affichera A_FAIRE/statut_detail à null en attendant).
    // Patch local immédiat
    for (const oid of obligationIds) {
      let statut_logique: StatutLogique = "A_FAIRE";
      if (libelle) {
        for (const r of filtered) {
          const c = r.cells.find((cc) => cc.obligationId === oid);
          if (c) {
            const opt = (statusOptions[c.type] ?? []).find((o) => o.libelle === libelle);
            if (opt) statut_logique = opt.statut_logique;
            break;
          }
        }
      }
      applyPatch({ obligationId: oid, statut_logique, statut_detail: libelle });
    }
    startTransition(async () => {
      await bulkUpdateObligationStatus(obligationIds, libelle);
      router.refresh();
    });
  }

  // Toutes les options de statut concaténées (uniques par libellé) pour le
  // bulk picker. Si plusieurs types ont le même libellé, on garde le premier.
  const allStatusOptions: StatusOption[] = useMemo(() => {
    const seen = new Map<string, StatusOption>();
    for (const opts of Object.values(statusOptions)) {
      for (const o of opts) {
        if (!seen.has(o.libelle)) seen.set(o.libelle, o);
      }
    }
    return [...seen.values()];
  }, [statusOptions]);

  function togglePeriodFilter(key: string) {
    setPeriodFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const colStats = useMemo(() => {
    const stats: Record<string, { total: number; done: number }> = {};
    for (const col of visibleCols) stats[col.key] = { total: 0, done: 0 };
    for (const r of filtered) {
      for (const c of r.cells) {
        if (!c.obligationId) continue;
        if (!stats[c.colKey]) continue;
        stats[c.colKey].total++;
        if (c.statut_logique === "TERMINE" || c.statut_logique === "NON_APPLICABLE") {
          stats[c.colKey].done++;
        }
      }
    }
    return stats;
  }, [filtered, visibleCols]);

  // Callbacks stables (useCallback) pour que StatusCell mémo ne se re-render
  // pas inutilement. Ils prennent obligationId/type en paramètres au lieu
  // d'être créés en closure à chaque cellule.
  const onPick = useCallback(
    (obligationId: string, libelle: string, type: string) => {
      const opts = statusOptions[type] ?? [];
      const opt = opts.find((o) => o.libelle === libelle);
      const patch: Patch = {
        obligationId,
        statut_logique: (opt?.statut_logique as StatutLogique) ?? "A_FAIRE",
        statut_detail: libelle,
      };
      applyPatch(patch);
      setOpenCellId(null);
      startTransition(async () => {
        await updateObligationStatus(obligationId, libelle);
        router.refresh();
      });
    },
    [statusOptions, applyPatch, router]
  );

  const onReset = useCallback(
    (obligationId: string) => {
      applyPatch({ obligationId, statut_logique: "A_FAIRE", statut_detail: null });
      setOpenCellId(null);
      startTransition(async () => {
        await updateObligationStatus(obligationId, null);
        router.refresh();
      });
    },
    [applyPatch, router]
  );

  // (Le système de notes legacy est remplacé par les commentaires latéraux.)

  // Stables : ouverture/fermeture du picker. StatusCell les appelle avec
  // son propre cellId en paramètre.
  const handleOpen = useCallback((cellId: string) => setOpenCellId(cellId), []);
  const handleClose = useCallback(() => setOpenCellId(null), []);

  // Ouverture du popover commentaires (depuis l'icône 💬 d'une cellule).
  // Capture le rect de l'élément cliqué pour ancrer le popover.
  const handleOpenComments = useCallback(
    (
      obligationId: string,
      label: string,
      anchorRect: { left: number; top: number; bottom: number; right: number }
    ) => {
      setOpenCommentsObligId(obligationId);
      setOpenCommentsLabel(label);
      setOpenCommentsAnchor(anchorRect);
      // Si le picker statut est ouvert, on le ferme pour ne pas avoir 2 popovers.
      setOpenCellId(null);
    },
    []
  );

  const handleCloseComments = useCallback(() => {
    setOpenCommentsObligId(null);
    setOpenCommentsAnchor(null);
  }, []);

  const handleCommentCountChange = useCallback(
    (obligationId: string, count: number) => {
      setCommentCounts((prev) => ({ ...prev, [obligationId]: count }));
    },
    []
  );

  return (
    <div className="space-y-3">
      {/* Barre d'outils unique, dense et ordonnée */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2">
        <input
          type="text"
          placeholder="Filtrer par client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60 transition"
        />
        <div className="h-6 w-px bg-zinc-200 mx-1" />
        <div className="inline-flex gap-1 items-center">
          <StatusFilterPill
            label="À faire"
            color="bg-amber-100 text-amber-800 border-amber-300"
            active={statusFilter.has("A_FAIRE")}
            onClick={() => toggleStatusFilter("A_FAIRE")}
          />
          <StatusFilterPill
            label="En cours"
            color="bg-blue-100 text-blue-800 border-blue-300"
            active={statusFilter.has("EN_COURS")}
            onClick={() => toggleStatusFilter("EN_COURS")}
          />
          <StatusFilterPill
            label="Terminé"
            color="bg-emerald-100 text-emerald-800 border-emerald-300"
            active={statusFilter.has("TERMINE")}
            onClick={() => toggleStatusFilter("TERMINE")}
          />
          <StatusFilterPill
            label="N/A"
            color="bg-zinc-100 text-zinc-700 border-zinc-300"
            active={statusFilter.has("NON_APPLICABLE")}
            onClick={() => toggleStatusFilter("NON_APPLICABLE")}
          />
        </div>
        {cols.length > 1 && (
          <>
            <div className="h-6 w-px bg-zinc-200 mx-1" />
            <div className="inline-flex gap-1 items-center flex-wrap">
              {cols.map((c) => (
                <button
                  key={c.key}
                  onClick={() => togglePeriodFilter(c.key)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[11px] font-medium border transition-all duration-150 active:scale-95",
                    periodFilter.has(c.key)
                      ? "bg-[hsl(var(--gold))] text-white border-[hsl(var(--gold))]"
                      : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  {c.label}
                </button>
              ))}
              {periodFilter.size > 0 && (
                <button
                  onClick={() => setPeriodFilter(new Set())}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors ml-0.5"
                  title="Toutes les périodes"
                >
                  ×
                </button>
              )}
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAutoFit((v) => !v)}
            className={cn(
              "px-2 py-1 rounded-md text-[11px] border transition-all duration-150 active:scale-95",
              autoFit
                ? "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] border-[hsl(var(--gold))]/40"
                : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
            )}
            title="Ajuster les colonnes au contenu"
          >
            ⇔ Auto
          </button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filtered.length} client{filtered.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div ref={tableRef} onKeyDown={onTableKeyDown} className="rounded-lg border overflow-auto bg-card">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-zinc-50 text-zinc-700 text-xs">
            <tr>
              <th className="sticky left-0 z-10 bg-zinc-50 text-left px-0 py-0 font-medium border-r min-w-[120px] md:min-w-[220px]">
                <button
                  onClick={selectAll}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[hsl(var(--gold))]/10 transition-colors group/all"
                  title="Tout sélectionner (Ctrl+A)"
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-zinc-300 bg-white text-zinc-400 group-hover/all:border-[hsl(var(--gold))] group-hover/all:text-[hsl(var(--gold))] transition-colors">
                    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor" aria-hidden>
                      <rect x="1" y="1" width="6" height="6" rx="1" />
                      <rect x="9" y="1" width="6" height="6" rx="1" />
                      <rect x="1" y="9" width="6" height="6" rx="1" />
                      <rect x="9" y="9" width="6" height="6" rx="1" />
                    </svg>
                  </span>
                  <span>Client</span>
                </button>
              </th>
              {visibleCols.map((col, colIndex) => {
                const s = colStats[col.key];
                const pct = s.total > 0 ? Math.round((s.done * 100) / s.total) : 0;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      "px-0 py-0 font-medium text-center",
                      !autoFit && "min-w-[78px] md:min-w-[120px]"
                    )}
                  >
                    <button
                      onClick={(e) => selectColumn(colIndex, e)}
                      className="w-full px-2 py-2 hover:bg-zinc-100 transition-colors"
                      title="Sélectionner toute la colonne"
                    >
                      <div>{col.label}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 font-normal">
                        {s.done}/{s.total} ({pct}%)
                      </div>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, rowIndex) => (
              <tr key={r.clientId} className="border-t hover:bg-zinc-50/50">
                <td className="sticky left-0 z-10 bg-white border-r group/row">
                  <div className="flex items-stretch">
                    <button
                      onClick={(e) => selectRow(rowIndex, e)}
                      className="w-4 shrink-0 flex items-center justify-center text-zinc-300 hover:text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/10 opacity-0 group-hover/row:opacity-100 transition-all"
                      title="Sélectionner toute la ligne"
                      tabIndex={-1}
                    >
                      <span className="text-xs">≡</span>
                    </button>
                    <div className="flex-1 px-2 py-2 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/clients/${r.clientSlug}`}
                          className="font-medium truncate hover:text-[hsl(var(--gold))] transition-colors"
                        >
                          {r.denomination}
                        </Link>
                        <PappersInpiBadges siren={r.siren} size="xs" />
                      </div>
                      {r.siren && (
                        <Link
                          href={`/clients/${r.clientSlug}`}
                          className="block text-xs text-muted-foreground tabular-nums hover:text-[hsl(var(--gold))] transition-colors"
                        >
                          {r.siren}
                        </Link>
                      )}
                    </div>
                  </div>
                </td>
                {r.cells
                  .filter((c) => visibleColKeysSet.has(c.colKey))
                  .map((c, colIndex) => {
                  const cellId = `${r.clientId}|${c.colKey}`;
                  const isHighlighted = highlightedCellId === cellId;
                  const isOpenCell = openCellId === cellId;
                  const isSelected = !!c.obligationId && selectedIds.has(c.obligationId);
                  const isAnchor =
                    isSelected && anchor?.row === rowIndex && anchor?.col === colIndex;
                  // Bordures façon Excel : on dessine un trait uniquement sur
                  // les côtés où le voisin n'est PAS sélectionné. Résultat :
                  // un grand rectangle continu englobant la zone.
                  const above = selectedCoords.has(`${rowIndex - 1}|${colIndex}`);
                  const below = selectedCoords.has(`${rowIndex + 1}|${colIndex}`);
                  const leftSel = selectedCoords.has(`${rowIndex}|${colIndex - 1}`);
                  const rightSel = selectedCoords.has(`${rowIndex}|${colIndex + 1}`);
                  const goldColor = "hsl(34, 32%, 52%)";
                  const tdStyle: React.CSSProperties | undefined = isSelected
                    ? (() => {
                        const parts: string[] = [];
                        if (!above)    parts.push(`inset 0 2px 0 0 ${goldColor}`);
                        if (!below)    parts.push(`inset 0 -2px 0 0 ${goldColor}`);
                        if (!leftSel)  parts.push(`inset 2px 0 0 0 ${goldColor}`);
                        if (!rightSel) parts.push(`inset -2px 0 0 0 ${goldColor}`);
                        return { boxShadow: parts.join(", ") };
                      })()
                    : undefined;
                  return (
                    <td
                      key={c.colKey}
                      data-cell-id={cellId}
                      data-obligation-id={c.obligationId ?? ""}
                      data-row-index={rowIndex}
                      data-col-index={colIndex}
                      style={tdStyle}
                      className={cn(
                        "group/cell px-1 py-1.5 text-center align-middle transition-colors",
                        isOpenCell && "relative z-40",
                        // Pas de fond pour les cellules commentées : le soulignage
                        // jaune est sur la pastille statut (cf. StatusCell).
                        isSelected && "bg-[hsl(var(--gold))]/10",
                        isAnchor && "bg-[hsl(var(--gold))]/20",
                        isHighlighted && "ring-2 ring-[hsl(var(--gold))] ring-offset-1 rounded animate-pulse"
                      )}
                      onMouseDown={(e) => onCellMouseDown(e, c.obligationId, rowIndex, colIndex)}
                    >
                      <StatusCell
                        cell={c}
                        cellId={cellId}
                        isOpen={openCellId === cellId}
                        isSelected={isSelected}
                        options={statusOptions[c.type] ?? []}
                        commentCount={c.obligationId ? commentCounts[c.obligationId] ?? 0 : 0}
                        rowLabel={`${r.denomination} · ${cols.find((col) => col.key === c.colKey)?.label ?? c.type}`}
                        onOpen={handleOpen}
                        onClose={handleClose}
                        onPick={onPick}
                        onReset={onReset}
                        onOpenComments={handleOpenComments}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td
                  colSpan={visibleCols.length + 1}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Aucun client ne correspond à ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barre d'action de sélection multi-cellules · pastilles directes,
          plus lisible qu'un dropdown */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto max-w-5xl animate-slide-up-fade">
          <div className="rounded-xl bg-[#0D1122] dark:bg-[hsl(var(--surface-elevated))] text-white shadow-2xl ring-1 ring-white/10 dark:ring-white/[0.18]">
            <div className="px-4 py-2.5 flex items-center gap-3 border-b border-white/10">
              <div className="text-sm font-medium">
                {selectedIds.size} cellule{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}
              </div>
              <div className="text-[11px] text-zinc-400">
                Clic sur un statut pour l'appliquer à toute la sélection
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => {
                    const g = buildClipboardGrid();
                    if (g) setClipboard(g);
                    const tsv = buildSelectionTsv();
                    if (tsv) navigator.clipboard?.writeText(tsv).catch(() => {});
                  }}
                  className="text-xs px-2.5 py-1 rounded-md text-zinc-200 hover:bg-white/10 transition-colors"
                  title="Copier la sélection (Ctrl+C)"
                >
                  ⧉ Copier
                </button>
                {clipboard && (
                  <button
                    onClick={() => {
                      // Colle à partir de la 1ère cellule sélectionnée (top-left)
                      let anchorRow = -1, anchorCol = -1;
                      filtered.forEach((row, rowIndex) => {
                        const visCells = visibleCellsOf(rowIndex);
                        visCells.forEach((cell, colIndex) => {
                          if (cell.obligationId && selectedIds.has(cell.obligationId)) {
                            if (anchorRow === -1 || rowIndex < anchorRow || (rowIndex === anchorRow && colIndex < anchorCol)) {
                              anchorRow = rowIndex;
                              anchorCol = colIndex;
                            }
                          }
                        });
                      });
                      if (anchorRow !== -1) pasteClipboardAt(anchorRow, anchorCol);
                    }}
                    className="text-xs px-2.5 py-1 rounded-md text-white bg-[hsl(var(--gold))] hover:opacity-90 transition flex items-center gap-1.5"
                    title={`Coller la grille ${clipboard.rows}×${clipboard.cols} (Ctrl+V)`}
                  >
                    Coller
                    <span className="opacity-90 font-mono text-[10px]">
                      {clipboard.rows}×{clipboard.cols}
                    </span>
                  </button>
                )}
                <button
                  onClick={clearSelection}
                  className="text-xs px-2.5 py-1 rounded-md text-zinc-300 hover:bg-white/10 transition-colors"
                  title="Échap pour vider"
                >
                  Vider ✕
                </button>
              </div>
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-2 items-center">
              {allStatusOptions.map((o) => (
                <button
                  key={o.libelle}
                  onClick={() => runBulk([...selectedIds], o.libelle)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium border transition-all duration-150 active:scale-95 hover:shadow-md hover:-translate-y-0.5",
                    statutColorClass(o.statut_logique, o.color)
                  )}
                  title={`Appliquer "${o.libelle}" à ${selectedIds.size} cellule${selectedIds.size > 1 ? "s" : ""}`}
                >
                  {o.libelle}
                </button>
              ))}
              <div className="h-5 w-px bg-white/20 mx-1" />
              <button
                onClick={() => runBulk([...selectedIds], null)}
                className="px-2.5 py-1 rounded-md text-xs text-zinc-300 hover:bg-white/10 transition-colors"
                title="Réinitialiser à la valeur par défaut du type"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popover commentaires (style Notion). Compact, ancré près de la cellule. */}
      {openCommentsObligId && (
        <CommentsPopover
          obligationId={openCommentsObligId}
          obligationLabel={openCommentsLabel}
          currentUserEmail={currentUserEmail}
          anchorRect={openCommentsAnchor}
          onClose={handleCloseComments}
          onCountChange={(count) =>
            handleCommentCountChange(openCommentsObligId, count)
          }
        />
      )}
    </div>
  );
}

function StatusFilterPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 active:scale-95",
        active
          ? cn(color, "shadow-sm")
          : "bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {label}
    </button>
  );
}

// Picker statut style Notion : sections groupées par statut_logique (À faire,
// En cours, Terminé, N/A), compact + fluide. La gestion de note libre est
// remplacée par le panel commentaires latéral (cliquable via icône 💬).
const STATUT_GROUP_ORDER: StatutLogique[] = ["A_FAIRE", "EN_COURS", "TERMINE", "NON_APPLICABLE"];
const STATUT_GROUP_LABEL: Record<StatutLogique, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  NON_APPLICABLE: "N/A",
};

const StatusCell = memo(function StatusCell({
  cell,
  cellId,
  isOpen,
  isSelected,
  onOpen,
  onClose,
  options,
  commentCount,
  rowLabel,
  onPick,
  onReset,
  onOpenComments,
}: {
  cell: TrackerCell;
  cellId: string;
  isOpen: boolean;
  isSelected?: boolean;
  onOpen: (cellId: string) => void;
  onClose: () => void;
  options: StatusOption[];
  commentCount: number;
  rowLabel: string;
  onPick: (obligationId: string, libelle: string, type: string) => void;
  onReset: (obligationId: string) => void;
  onOpenComments: (
    obligationId: string,
    label: string,
    anchorRect: { left: number; top: number; bottom: number; right: number }
  ) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-cell-button]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_ESTIMATED_HEIGHT = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_ESTIMATED_HEIGHT && spaceAbove > spaceBelow;
    setPos({
      left: rect.left + rect.width / 2,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onScroll() {
      onClose();
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  // Groupes d'options par statut_logique pour le picker Notion-like.
  const grouped = useMemo(() => {
    const groups: Record<StatutLogique, StatusOption[]> = {
      A_FAIRE: [],
      EN_COURS: [],
      TERMINE: [],
      NON_APPLICABLE: [],
    };
    for (const opt of options) groups[opt.statut_logique].push(opt);
    return groups;
  }, [options]);

  if (!cell.obligationId) {
    return <span className="text-zinc-300 text-xs">·</span>;
  }

  const matchedOption = options.find((o) => o.libelle === cell.statut_detail);
  const colorClass = statutColorClass(cell.statut_logique, matchedOption?.color);
  const defaultLibelle = options.find((o) => o.statut_logique === "A_FAIRE")?.libelle ?? "·";

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            e.preventDefault();
            return;
          }
          onOpen(cellId);
        }}
        data-cell-button="1"
        tabIndex={0}
        style={
          // Soulignage jaune sous la pastille si commentaires (style Notion).
          // box-shadow inset → pas de modif de taille, contrairement à un border.
          commentCount > 0
            ? { boxShadow: "inset 0 -2px 0 0 rgb(251 191 36)" } // amber-400
            : undefined
        }
        className={cn(
          "relative inline-block px-2 py-1 rounded-md text-[11px] font-medium border max-w-[110px] truncate hover:opacity-80 hover:shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-1",
          colorClass
        )}
        title={cell.echeance ? `Échéance : ${fmtDateFr(cell.echeance)}` : undefined}
      >
        {cell.statut_detail ?? defaultLibelle}
      </button>

      {/* Bulle commentaires (style Notion).
          - En position ABSOLUTE → sort du flux, la cellule ne se déforme pas
            au hover (la pastille statut garde sa position).
          - Cachée par défaut, visible UNIQUEMENT au hover du td parent
            (group/cell sur le td).
          - Sur mobile (pas de hover), affichage léger pour qu'elle reste
            tappable. */}
      {cell.obligationId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!cell.obligationId) return;
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOpenComments(cell.obligationId, rowLabel, {
              left: rect.left,
              top: rect.top,
              bottom: rect.bottom,
              right: rect.right,
            });
          }}
          className={cn(
            "absolute left-full top-1/2 -translate-y-1/2 ml-0.5",
            "inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] transition-opacity",
            // Cachée par défaut, révélée au hover du td parent
            "opacity-0 group-hover/cell:opacity-100",
            // Mobile : visible discrètement (pas de hover réel sur touch)
            "max-md:opacity-60",
            commentCount > 0
              ? "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 font-medium"
              : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          )}
          title={
            commentCount > 0
              ? `${commentCount} commentaire${commentCount > 1 ? "s" : ""}`
              : "Ajouter un commentaire"
          }
          aria-label={
            commentCount > 0
              ? `${commentCount} commentaire${commentCount > 1 ? "s" : ""}`
              : "Ajouter un commentaire"
          }
        >
          <MessageSquare className="h-3 w-3" />
          {commentCount > 0 && <span className="tabular-nums">{commentCount}</span>}
        </button>
      )}

      {isOpen && pos && (
        <div
          style={{
            position: "fixed",
            left: `${pos.left}px`,
            top: `${pos.top}px`,
            transform: pos.openUp
              ? "translate(-50%, calc(-100% - 8px))"
              : "translate(-50%, 8px)",
            zIndex: 1000,
          }}
          className="bg-white border rounded-lg shadow-xl min-w-[240px] text-left animate-slide-up-fade overflow-hidden"
        >
          {cell.echeance && (
            <div className="px-3 py-1.5 text-[10px] text-zinc-500 border-b bg-zinc-50/50">
              Échéance : <span className="font-medium text-zinc-700 tabular-nums">{fmtDateFr(cell.echeance)}</span>
            </div>
          )}

          {/* Statut courant en gros (style Notion) */}
          <div className="px-3 py-2 border-b">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Statut actuel</div>
            <span
              className={cn(
                "inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border",
                colorClass
              )}
            >
              {cell.statut_detail ?? defaultLibelle}
            </span>
          </div>

          {/* Sections par statut_logique (style Notion) */}
          <div className="max-h-[300px] overflow-y-auto py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500">
                Pas de libellés disponibles.
              </div>
            ) : (
              STATUT_GROUP_ORDER.map((groupKey) => {
                const groupOpts = grouped[groupKey];
                if (groupOpts.length === 0) return null;
                return (
                  <div key={groupKey} className="py-0.5">
                    <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-zinc-400 font-medium">
                      {STATUT_GROUP_LABEL[groupKey]}
                    </div>
                    {groupOpts.map((opt) => (
                      <button
                        key={opt.libelle}
                        onClick={() => cell.obligationId && onPick(cell.obligationId, opt.libelle, cell.type)}
                        className={cn(
                          "w-full text-left px-3 py-1 text-xs hover:bg-zinc-100 flex items-center gap-2 transition-colors",
                          cell.statut_detail === opt.libelle && "bg-zinc-50"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap",
                            statutColorClass(opt.statut_logique, opt.color)
                          )}
                        >
                          {opt.libelle}
                        </span>
                        {cell.statut_detail === opt.libelle && (
                          <span className="text-zinc-400 ml-auto text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer : actions secondaires (commentaires + reset) */}
          <div className="border-t bg-zinc-50/50">
            <button
              onClick={(e) => {
                if (!cell.obligationId) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onOpenComments(cell.obligationId, rowLabel, {
                  left: rect.left,
                  top: rect.top,
                  bottom: rect.bottom,
                  right: rect.right,
                });
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-100 transition-colors flex items-center gap-2"
            >
              <MessageSquare className="h-3 w-3 text-zinc-500" />
              <span>
                {commentCount > 0
                  ? `Commentaires (${commentCount})`
                  : "Ajouter un commentaire"}
              </span>
            </button>
            {cell.statut_detail && (
              <button
                onClick={() => cell.obligationId && onReset(cell.obligationId)}
                className="w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-100 transition-colors border-t"
              >
                Réinitialiser le statut
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.cell.obligationId === next.cell.obligationId &&
    prev.cell.statut_logique === next.cell.statut_logique &&
    prev.cell.statut_detail === next.cell.statut_detail &&
    prev.cell.echeance === next.cell.echeance &&
    prev.cell.type === next.cell.type &&
    prev.isOpen === next.isOpen &&
    prev.isSelected === next.isSelected &&
    prev.options === next.options &&
    prev.commentCount === next.commentCount &&
    prev.rowLabel === next.rowLabel &&
    prev.onOpen === next.onOpen &&
    prev.onClose === next.onClose &&
    prev.onPick === next.onPick &&
    prev.onReset === next.onReset &&
    prev.onOpenComments === next.onOpenComments
  );
});
