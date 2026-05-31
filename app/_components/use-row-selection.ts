"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hook generique de selection multi-rows style Excel/Linear.
 *
 * Gestes utilisateur :
 *   - clic                  -> selection unique (remplace) + set focus
 *   - shift + clic          -> range de l'ancre a la row cliquee
 *   - cmd/ctrl + clic       -> toggle (ajoute / retire)
 *   - fleches haut/bas      -> move focus + remplace selection
 *   - shift + fleches       -> etend la selection vers la nouvelle position
 *   - cmd/ctrl + A          -> select all
 *   - Esc                   -> efface selection
 *
 * Le hook expose aussi :
 *   - focusedId : l'ID de la row "active" pour la navigation clavier
 *   - onKeyDown : a brancher sur le container (ex. <table onKeyDown={...}>
 *     avec tabIndex={0}) pour activer la navigation
 *
 * Copy/paste : pour les callbacks Cmd+C / Cmd+V, le hook expose des helpers
 * mais c'est au composant parent d'implementer le serialize / deserialize
 * du contenu (TSV typiquement), via les props onCopy et onPaste.
 */
export function useRowSelection(
  orderedIds: string[],
  opts?: {
    onCopy?: (selectedIds: string[]) => void;
    onPaste?: (text: string, selectedIds: string[]) => void;
  }
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Nettoie la selection des IDs qui ne sont plus visibles
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
    // Si le focus est sur une row qui n'existe plus, on le clear
    setFocusedId((prev) => (prev && orderedIds.includes(prev) ? prev : null));
  }, [orderedIds]);

  // Esc -> clear (listener global pour ne pas necessiter le focus)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
        setAnchorId(null);
        setFocusedId(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds.size]);

  // Cmd/Ctrl + A : select all (listener global, deletes default si focus sur
  // table). Cmd/Ctrl + C / V : copy / paste (deleguent au parent).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      // On reagit seulement si pas dans un input/textarea/editable
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      // Ne reagit que si on a au moins 1 row visible
      if (orderedIds.length === 0) return;

      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(orderedIds));
        setAnchorId(orderedIds[0]);
        setFocusedId(orderedIds[0]);
        return;
      }
      if (e.key.toLowerCase() === "c" && opts?.onCopy && selectedIds.size > 0) {
        opts.onCopy(Array.from(selectedIds));
        // Ne preventDefault pas : on laisse aussi le navigator.clipboard
        // remplir via writeText cote parent
        return;
      }
      if (e.key.toLowerCase() === "v" && opts?.onPaste && selectedIds.size > 0) {
        // Lit le clipboard via API moderne (asynchrone) et appelle onPaste
        e.preventDefault();
        navigator.clipboard?.readText?.().then((text) => {
          if (text) opts.onPaste!(text, Array.from(selectedIds));
        }).catch(() => {
          // Fallback : pas d'access clipboard, on ne fait rien
        });
        return;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [orderedIds, selectedIds, opts]);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
    setFocusedId(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(orderedIds));
    setAnchorId(orderedIds[0] ?? null);
    setFocusedId(orderedIds[0] ?? null);
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
          setFocusedId(id);
          return;
        }
        const min = Math.min(anchorIdx, idx);
        const max = Math.max(anchorIdx, idx);
        const next = new Set<string>();
        for (let i = min; i <= max; i++) next.add(orderedIds[i]);
        setSelectedIds(next);
        setFocusedId(id);
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
        setFocusedId(id);
        return;
      }
      // Clic simple : remplace
      setSelectedIds(new Set([id]));
      setAnchorId(id);
      setFocusedId(id);
    },
    [anchorId, orderedIds]
  );

  // Navigation clavier : a brancher sur le container (table) avec tabIndex
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (orderedIds.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        const currentIdx = focusedId ? orderedIds.indexOf(focusedId) : -1;
        const nextIdx = currentIdx === -1
          ? (dir === 1 ? 0 : orderedIds.length - 1)
          : Math.max(0, Math.min(orderedIds.length - 1, currentIdx + dir));
        const nextId = orderedIds[nextIdx];
        if (e.shiftKey && anchorId) {
          // Etend la selection de anchor a nextId
          const anchorIdx = orderedIds.indexOf(anchorId);
          if (anchorIdx >= 0) {
            const min = Math.min(anchorIdx, nextIdx);
            const max = Math.max(anchorIdx, nextIdx);
            const next = new Set<string>();
            for (let i = min; i <= max; i++) next.add(orderedIds[i]);
            setSelectedIds(next);
          }
        } else {
          setSelectedIds(new Set([nextId]));
          setAnchorId(nextId);
        }
        setFocusedId(nextId);
      }
    },
    [orderedIds, focusedId, anchorId]
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    focusedId,
    onRowClick,
    onKeyDown,
    clearSelection,
    selectAll,
    anchorId,
  };
}
