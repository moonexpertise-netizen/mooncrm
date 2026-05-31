"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hook generique de selection multi-rows style Excel/Linear.
 *
 * Geste utilisateurs supportes :
 *   - clic sur une row  -> selection unique (remplace)
 *   - shift + clic      -> range de l'ancre a la row cliquee
 *   - cmd/ctrl + clic   -> toggle (ajoute / retire)
 *   - Esc               -> efface la selection
 *
 * Usage :
 *   const { selectedIds, isSelected, onRowClick, clearSelection, selectAll }
 *     = useRowSelection(orderedIds);
 *   <tr onClick={(e) => onRowClick(row.id, e)} className={isSelected(row.id) ? "..." : ""}/>
 *
 * Les IDs sont des strings (UUIDs en general). orderedIds doit refleter
 * l'ordre visuel actuel (post-filtre / post-tri) pour que le shift-click
 * range fonctionne correctement.
 */
export function useRowSelection(orderedIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Si les rows visibles changent (filtre / tri), on nettoie la selection des
  // IDs qui ne sont plus visibles. Sinon l'utilisateur peut avoir des items
  // selectionnes "fantomes".
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(orderedIds);
      const next = new Set<string>();
      let changed = false;
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [orderedIds]);

  // Esc -> clear
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
        setAnchorId(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds.size]);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(orderedIds));
    setAnchorId(orderedIds[0] ?? null);
  }, [orderedIds]);

  const onRowClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      // shift + clic : range de anchor a id
      if (e.shiftKey && anchorId && anchorId !== id) {
        const anchorIdx = orderedIds.indexOf(anchorId);
        const idx = orderedIds.indexOf(id);
        if (anchorIdx === -1 || idx === -1) {
          setSelectedIds(new Set([id]));
          setAnchorId(id);
          return;
        }
        const min = Math.min(anchorIdx, idx);
        const max = Math.max(anchorIdx, idx);
        const next = new Set<string>();
        for (let i = min; i <= max; i++) next.add(orderedIds[i]);
        setSelectedIds(next);
        return;
      }
      // cmd/ctrl + clic : toggle
      if (e.metaKey || e.ctrlKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setAnchorId(id);
        return;
      }
      // Clic simple : remplace
      setSelectedIds(new Set([id]));
      setAnchorId(id);
    },
    [anchorId, orderedIds]
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    onRowClick,
    clearSelection,
    selectAll,
    anchorId,
  };
}
