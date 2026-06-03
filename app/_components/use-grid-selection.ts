"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Hook generique de selection multi-cellules en GRILLE 2D, style Excel/Linear.
 *
 * Differences avec useRowSelection (1D, row par row) :
 *   - Position des cellules = (row, col), donc nav ↑↓←→ vraiment 2D
 *   - Skip les cellules vides (cellId = null) dans la direction de navigation
 *   - Selection range = rectangle entre ancre et cible (pas une liste plate)
 *
 * Gestes utilisateur :
 *   - clic                  -> selection unique + focus
 *   - shift + clic          -> range rectangulaire de l'ancre a la cellule
 *   - cmd/ctrl + clic       -> toggle (ajoute / retire)
 *   - fleches ↑↓←→          -> move focus + remplace selection
 *   - shift + fleches       -> etend la selection rectangulaire
 *   - cmd/ctrl + A          -> select all (cellules non-null)
 *   - cmd/ctrl + C / V      -> deleguent au parent via onCopy / onPaste
 *   - Esc                   -> efface selection
 *
 * Le hook gere lui-meme le listener document.keydown -> les fleches marchent
 * peu importe ou est le focus DOM (resout le bug ou le focus part sur le
 * picker quand on clique une cellule, et la <table> n'a plus le focus).
 */
export function useGridSelection(
  /** gridIds[row][col] = cellId ou null. Doit avoir le meme nombre de cols
   *  partout (rectangulaire). Les cellules null sont "trous" et sautees par
   *  la navigation fleches. */
  gridIds: (string | null)[][],
  opts?: {
    onCopy?: (selectedIds: string[]) => void;
    onPaste?: (text: string, selectedIds: string[]) => void;
  }
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedPos, setFocusedPos] = useState<{ row: number; col: number } | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ row: number; col: number } | null>(null);

  const numRows = gridIds.length;
  const numCols = gridIds[0]?.length ?? 0;

  // Lookup id -> position pour les bulk ops
  const posByCellId = useMemo(() => {
    const m = new Map<string, { row: number; col: number }>();
    gridIds.forEach((row, r) => {
      row.forEach((id, c) => {
        if (id) m.set(id, { row: r, col: c });
      });
    });
    return m;
  }, [gridIds]);

  // Cleanup : si une cellId selectionnee/focused disparait (filtre, change
  // d'annee), on la retire de la selection / du focus.
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
      if (prev.row >= numRows || prev.col >= numCols) return null;
      return prev;
    });
    setAnchorPos((prev) => {
      if (!prev) return prev;
      if (prev.row >= numRows || prev.col >= numCols) return null;
      return prev;
    });
  }, [gridIds, numRows, numCols]);

  const isSelected = useCallback((cellId: string) => selectedIds.has(cellId), [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setFocusedPos(null);
    setAnchorPos(null);
  }, []);

  const selectAll = useCallback(() => {
    const all = new Set<string>();
    gridIds.forEach((row) => row.forEach((id) => { if (id) all.add(id); }));
    setSelectedIds(all);
    // Set focus + ancre sur la 1ere cellule non-null
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        if (gridIds[r][c]) {
          setFocusedPos({ row: r, col: c });
          setAnchorPos({ row: r, col: c });
          return;
        }
      }
    }
  }, [gridIds, numRows, numCols]);

  // Range rectangulaire entre 2 positions (inclut tous les cellIds non-null)
  const rangeIds = useCallback(
    (a: { row: number; col: number }, b: { row: number; col: number }) => {
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
    },
    [gridIds]
  );

  const onCellClick = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
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
    },
    [gridIds, anchorPos, rangeIds]
  );

  // Trouve la prochaine position non-null dans une direction
  const nextPos = useCallback(
    (
      from: { row: number; col: number },
      direction: "up" | "down" | "left" | "right"
    ): { row: number; col: number } | null => {
      const dr = direction === "up" ? -1 : direction === "down" ? 1 : 0;
      const dc = direction === "left" ? -1 : direction === "right" ? 1 : 0;
      let r = from.row + dr;
      let c = from.col + dc;
      while (r >= 0 && r < numRows && c >= 0 && c < numCols) {
        if (gridIds[r][c]) return { row: r, col: c };
        r += dr;
        c += dc;
      }
      return null;
    },
    [gridIds, numRows, numCols]
  );

  // Listener document.keydown : fleches + Cmd+A/C/V/Esc
  useEffect(() => {
    function onDocKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      if (document.querySelector("[role='listbox']") &&
          (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        return;
      }

      // Esc
      if (e.key === "Escape" && selectedIds.size > 0) {
        clearSelection();
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "a" && numRows > 0) {
        e.preventDefault();
        selectAll();
        return;
      }
      if (meta && e.key.toLowerCase() === "c" && opts?.onCopy && selectedIds.size > 0) {
        opts.onCopy(Array.from(selectedIds));
        return;
      }
      if (meta && e.key.toLowerCase() === "v" && opts?.onPaste && selectedIds.size > 0) {
        e.preventDefault();
        navigator.clipboard?.readText?.().then((text) => {
          if (text) opts.onPaste!(text, Array.from(selectedIds));
        }).catch(() => { /* ignore */ });
        return;
      }

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
        setSelectedIds(rangeIds(anchorPos, next));
      } else {
        setSelectedIds(new Set([nextId]));
        setAnchorPos(next);
      }
      setFocusedPos(next);
    }
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [focusedPos, anchorPos, selectedIds, gridIds, numRows, nextPos, rangeIds, clearSelection, selectAll, opts]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    focusedPos,
    anchorPos,
    isSelected,
    onCellClick,
    clearSelection,
    selectAll,
    posByCellId,
    /** Helper a appeler dans le onClick de chaque td : passe (row, col) +
     *  l'event React.MouseEvent. Le hook gere shift/cmd/clic. */
    setFocus: (row: number, col: number) => {
      setFocusedPos({ row, col });
      setAnchorPos({ row, col });
    },
    /** Selectionne une cellule + focus + ancre, sans tester shift/cmd.
     *  Utile pour : "clic sur le picker button = ouvre le picker ET selectionne". */
    selectOne: (cellId: string) => {
      const pos = posByCellId.get(cellId);
      if (!pos) return;
      setSelectedIds(new Set([cellId]));
      setFocusedPos(pos);
      setAnchorPos(pos);
    },
  };
}
