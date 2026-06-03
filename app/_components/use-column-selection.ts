"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Hook de selection multi-cellules pour les grilles a colonnes HETEROGENES
 * (ex. Statut + Facturation : pas la meme nature, pas le meme picker).
 *
 * Difference cle vs useGridSelection :
 *   La selection est TOUJOURS contrainte a UNE seule colonne a la fois
 *   (activeCol). Cliquer dans une autre colonne reset la selection vers
 *   cette nouvelle colonne. Plus de selection rectangulaire entre cols
 *   qui melangerait des types differents (qui n'a aucun sens : un libelle
 *   Statut ne peut pas etre colle dans une cell Facturation).
 *
 * Inspire du tracker TVA mensuelle (focus DOM via querySelector, Cmd+A
 * sur colonne courante, Cmd+C/V positional, Esc clear).
 *
 * Gestes :
 *   - clic                  -> single select + activeCol = col
 *   - shift + clic (meme col)  -> etend verticalement depuis l'ancre
 *   - shift + clic (autre col) -> ignore le shift, single select dans nouvelle col
 *   - cmd/ctrl + clic (meme col) -> toggle
 *   - cmd/ctrl + clic (autre col) -> change de col, single select
 *   - fleches ↑↓               -> nav meme colonne (skip null)
 *   - fleches ←→               -> change de col, vide selection, focus row courante
 *   - shift + ↑↓               -> etend dans la colonne en cours
 *   - cmd/ctrl + A             -> tout selectionner dans activeCol
 *   - cmd/ctrl + C/V           -> deleguent au parent (onCopy / onPaste)
 *   - Esc                      -> clear
 */
export function useColumnSelection(
  gridIds: (string | null)[][],
  opts?: {
    onCopy?: (selectedIds: string[], col: number) => void;
    onPaste?: (text: string, selectedIds: string[], col: number) => void;
    /** Callback appele a chaque deplacement de focus pour que le parent
     *  puisse mettre le focus DOM sur le picker button (comme TVA). */
    onFocus?: (row: number, col: number) => void;
  }
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedPos, setFocusedPos] = useState<{ row: number; col: number } | null>(null);
  const [anchorRow, setAnchorRow] = useState<number | null>(null);

  const numRows = gridIds.length;
  const numCols = gridIds[0]?.length ?? 0;
  const activeCol = focusedPos?.col ?? null;

  const onFocusRef = useMemo(() => ({ current: opts?.onFocus }), [opts?.onFocus]);

  // Cleanup quand la grille change (filtres, year change, etc.)
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
    setAnchorRow((prev) => {
      if (prev === null) return prev;
      if (prev >= numRows) return null;
      return prev;
    });
  }, [gridIds, numRows, numCols]);

  const isSelected = useCallback((cellId: string) => selectedIds.has(cellId), [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setFocusedPos(null);
    setAnchorRow(null);
  }, []);

  // Range vertical dans une colonne donnee
  const rangeIdsInCol = useCallback(
    (rowA: number, rowB: number, col: number) => {
      const rMin = Math.min(rowA, rowB);
      const rMax = Math.max(rowA, rowB);
      const ids = new Set<string>();
      for (let r = rMin; r <= rMax; r++) {
        const id = gridIds[r]?.[col];
        if (id) ids.add(id);
      }
      return ids;
    },
    [gridIds]
  );

  const selectAll = useCallback(() => {
    if (activeCol === null) {
      // Pas de col active : on prend la 1ere col non vide
      for (let c = 0; c < numCols; c++) {
        for (let r = 0; r < numRows; r++) {
          if (gridIds[r][c]) {
            const all = new Set<string>();
            for (let rr = 0; rr < numRows; rr++) {
              const id = gridIds[rr][c];
              if (id) all.add(id);
            }
            setSelectedIds(all);
            setFocusedPos({ row: r, col: c });
            setAnchorRow(r);
            onFocusRef.current?.(r, c);
            return;
          }
        }
      }
      return;
    }
    const all = new Set<string>();
    for (let r = 0; r < numRows; r++) {
      const id = gridIds[r][activeCol];
      if (id) all.add(id);
    }
    setSelectedIds(all);
    if (focusedPos) setAnchorRow(focusedPos.row);
  }, [gridIds, numRows, numCols, activeCol, focusedPos, onFocusRef]);

  const onCellClick = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      const cellId = gridIds[row]?.[col];
      if (!cellId) return;

      // Si on est dans une autre colonne -> change col, single select
      if (activeCol !== col) {
        setSelectedIds(new Set([cellId]));
        setFocusedPos({ row, col });
        setAnchorRow(row);
        onFocusRef.current?.(row, col);
        return;
      }

      // Meme colonne : shift / cmd / clic simple
      if (e.shiftKey && anchorRow !== null) {
        setSelectedIds(rangeIdsInCol(anchorRow, row, col));
        setFocusedPos({ row, col });
        onFocusRef.current?.(row, col);
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
        setAnchorRow(row);
        onFocusRef.current?.(row, col);
        return;
      }
      setSelectedIds(new Set([cellId]));
      setFocusedPos({ row, col });
      setAnchorRow(row);
      onFocusRef.current?.(row, col);
    },
    [gridIds, activeCol, anchorRow, rangeIdsInCol, onFocusRef]
  );

  // Trouve prochaine row non-null dans une col donnee, dans une direction
  const nextRowInCol = useCallback(
    (fromRow: number, col: number, dir: 1 | -1): number | null => {
      let r = fromRow + dir;
      while (r >= 0 && r < numRows) {
        if (gridIds[r]?.[col]) return r;
        r += dir;
      }
      return null;
    },
    [gridIds, numRows]
  );

  // Trouve prochaine col non-null dans une row donnee, dans une direction
  const nextColInRow = useCallback(
    (fromCol: number, row: number, dir: 1 | -1): number | null => {
      let c = fromCol + dir;
      while (c >= 0 && c < numCols) {
        if (gridIds[row]?.[c]) return c;
        c += dir;
      }
      return null;
    },
    [gridIds, numCols]
  );

  // Listener doc.keydown
  useEffect(() => {
    function onDocKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || target?.isContentEditable;
      // Si un picker (listbox) est ouvert, on ne hijack pas les fleches
      const pickerOpen = !!document.querySelector("[role='listbox']");

      // Esc : vide la SELECTION mais garde focusedPos / anchorRow ->
      // l'utilisateur peut continuer a naviguer avec les fleches.
      // (sinon, Esc -> plus de focus -> fleches mortes, frustrant).
      if (e.key === "Escape" && selectedIds.size > 0 && !pickerOpen) {
        setSelectedIds(new Set());
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "a" && !isInput && !pickerOpen && numRows > 0) {
        e.preventDefault();
        selectAll();
        return;
      }
      if (meta && e.key.toLowerCase() === "c" && !isInput && !pickerOpen
          && opts?.onCopy && selectedIds.size > 0 && activeCol !== null) {
        e.preventDefault();
        opts.onCopy(Array.from(selectedIds), activeCol);
        return;
      }
      if (meta && e.key.toLowerCase() === "v" && !isInput && !pickerOpen
          && opts?.onPaste && selectedIds.size > 0 && activeCol !== null) {
        e.preventDefault();
        const activeColLocal = activeCol;
        navigator.clipboard?.readText?.().then((text) => {
          if (text) opts.onPaste!(text, Array.from(selectedIds), activeColLocal);
        }).catch(() => { /* ignore */ });
        return;
      }

      if (!focusedPos || pickerOpen || isInput) return;
      const isArrow =
        e.key === "ArrowUp" || e.key === "ArrowDown" ||
        e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (!isArrow) return;
      e.preventDefault();

      // Fleches verticales : nav dans activeCol, shift = etend, sinon single
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const dir: 1 | -1 = e.key === "ArrowDown" ? 1 : -1;
        const nextR = nextRowInCol(focusedPos.row, focusedPos.col, dir);
        if (nextR === null) return;
        const nextId = gridIds[nextR][focusedPos.col];
        if (!nextId) return;
        if (e.shiftKey && anchorRow !== null) {
          setSelectedIds(rangeIdsInCol(anchorRow, nextR, focusedPos.col));
        } else {
          setSelectedIds(new Set([nextId]));
          setAnchorRow(nextR);
        }
        setFocusedPos({ row: nextR, col: focusedPos.col });
        onFocusRef.current?.(nextR, focusedPos.col);
        return;
      }

      // Fleches horizontales : change de colonne, vide la selection courante
      const dir: 1 | -1 = e.key === "ArrowRight" ? 1 : -1;
      const nextC = nextColInRow(focusedPos.col, focusedPos.row, dir);
      if (nextC === null) return;
      const nextId = gridIds[focusedPos.row]?.[nextC];
      if (!nextId) return;
      setSelectedIds(new Set([nextId]));
      setFocusedPos({ row: focusedPos.row, col: nextC });
      setAnchorRow(focusedPos.row);
      onFocusRef.current?.(focusedPos.row, nextC);
    }
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [focusedPos, anchorRow, selectedIds, gridIds, numRows, activeCol, nextRowInCol, nextColInRow, rangeIdsInCol, clearSelection, selectAll, opts, onFocusRef]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    /** Colonne active (celle ou la selection vit). null = pas de selection. */
    activeCol,
    focusedPos,
    isSelected,
    onCellClick,
    clearSelection,
    selectAll,
    /** Pour les clics sur les pickers (qui ouvrent un popover) : on veut quand
     *  meme marquer la cellule comme selectionnee + focus. Pas de shift/cmd. */
    selectOne: (row: number, col: number) => {
      const cellId = gridIds[row]?.[col];
      if (!cellId) return;
      setSelectedIds(new Set([cellId]));
      setFocusedPos({ row, col });
      setAnchorRow(row);
      onFocusRef.current?.(row, col);
    },
  };
}
