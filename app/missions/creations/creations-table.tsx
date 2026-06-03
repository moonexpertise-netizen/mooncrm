"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useColumnSelection } from "@/app/_components/use-column-selection";
import { toggleFilterKey } from "@/app/_components/filter-multi-select";
import { BulkActionBar } from "@/app/_components/bulk-action-bar";
import {
  bulkSetCreationStatut,
  setCreationFacturation,
  setCreationStatut,
  toggleCreationSubscription,
  type CreationFacturation,
  type CreationStatut,
} from "./actions";
import { StatusFilterChip } from "@/app/_components/status-filter-chip";

export type { CreationStatut, CreationFacturation };

export type CreationRow = {
  id: string;
  slug: string;
  denomination: string;
  forme: string | null;
  pipeline_statut: string | null;
  creation_annee: number | null;
  creation_statut: CreationStatut | null;
  creation_facturation: CreationFacturation | null;
  honoraires_creation: number | null;
};

// Etats facturation : meme palette que IR/CAA/Missions exc.
const FACT_OPTIONS: Array<{ key: CreationFacturation; label: string; color: string }> = [
  { key: "a_facturer", label: "À facturer", color: "bg-amber-50 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/50" },
  { key: "facturee", label: "Facturée", color: "bg-emerald-50 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/50" },
  { key: "sans_facture", label: "Sans facture", color: "bg-zinc-50 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10]" },
];

// ============================================================================
// Constantes statut
// ============================================================================

const STATUT_DEF: Array<{
  key: CreationStatut | "non_demarre";
  label: string;
  group: "a_faire" | "en_cours" | "termine";
  color: string;
}> = [
  {
    key: "non_demarre",
    label: "—",
    group: "a_faire",
    color: "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10]",
  },
  {
    key: "a_traiter",
    label: "À traiter",
    group: "a_faire",
    color: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/30",
  },
  {
    key: "depot_capital",
    label: "Dépôt de capital",
    group: "en_cours",
    color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "inpi_en_cours",
    label: "INPI en cours",
    group: "en_cours",
    color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "inpi_termine",
    label: "INPI terminé",
    group: "en_cours",
    color: "bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "actee_kbis_recu",
    label: "Actée · KBIS reçu",
    group: "termine",
    color: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/30",
  },
];

function defFor(statut: CreationStatut | null): (typeof STATUT_DEF)[number] {
  if (!statut) return STATUT_DEF[0];
  return STATUT_DEF.find((s) => s.key === statut) ?? STATUT_DEF[0];
}

// ============================================================================
// Composant principal
// ============================================================================

export default function CreationsTable({
  rows,
  mode,
  selectedYear,
  center,
  years,
  pillYears,
}: {
  rows: CreationRow[];
  mode: "base" | "year";
  selectedYear: number;
  center: number;
  years: number[];
  /** Fenetre elargie a 6 ans pour les pills de souscription en vue Base. */
  pillYears?: number[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localRows, setLocalRows] = useState(rows);
  // Set vide = "Tous". Cmd/Ctrl+clic = toggle (pattern multi-select uniforme).
  type StatusGroup = "a_faire" | "en_cours" | "termine";
  const [filter, setFilter] = useState<Set<StatusGroup>>(new Set());
  useEffect(() => setLocalRows(rows), [rows]);

  // Vue Annee : on n'affiche QUE les dossiers souscrits a l'annee selectionnee,
  // puis on applique le filtre par groupe de statut (a faire / en cours / fait).
  // Vue Base : on affiche tous les dossiers, pour permettre l'inscription.
  const yearRows = useMemo(
    () =>
      mode === "year"
        ? localRows.filter((r) => r.creation_annee === selectedYear)
        : localRows,
    [localRows, mode, selectedYear]
  );

  const visibleRows = useMemo(() => {
    if (mode !== "year" || filter.size === 0) return yearRows;
    return yearRows.filter((r) => filter.has(defFor(r.creation_statut).group as StatusGroup));
  }, [yearRows, mode, filter]);

  // Compteurs par groupe pour les chips
  const yearCounts = useMemo(() => {
    const c = { a_faire: 0, en_cours: 0, termine: 0 };
    for (const r of yearRows) c[defFor(r.creation_statut).group]++;
    return c;
  }, [yearRows]);

  // Selection 2 colonnes : Statut | Facturation. Une seule active a la fois
  // (useColumnSelection). Cliquer dans l'autre colonne reset la selection :
  // un libelle statut ne peut pas etre colle dans une cell facturation.
  const COL_STATUT = 0;
  const COL_FACT = 1;
  const gridIds = useMemo<(string | null)[][]>(() => {
    if (mode !== "year") return [];
    return visibleRows.map((r) => [`${r.id}|STATUT`, `${r.id}|FACT`]);
  }, [visibleRows, mode]);

  function rowIdsFromSelection(): string[] {
    const out: string[] = [];
    for (const cid of selectedIds) {
      const [rowId] = cid.split("|");
      if (rowId) out.push(rowId);
    }
    return out;
  }

  // Copy : libelles de la colonne active, 1 par ligne
  function buildCopyText(col: number): string {
    return rowIdsFromSelection()
      .map((id) => {
        const r = localRows.find((x) => x.id === id);
        if (!r) return "";
        if (col === COL_STATUT) return defFor(r.creation_statut).label;
        if (col === COL_FACT) {
          const def = FACT_OPTIONS.find((o) => o.key === r.creation_facturation);
          return def?.label ?? "";
        }
        return "";
      })
      .join("\n");
  }

  // Paste : 1 valeur = fill-all, sinon positional. Switch sur col active.
  function applyPasteText(text: string, allIds: string[], col: number) {
    const ids = allIds.map((cid) => cid.split("|")[0]).filter(Boolean);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0 || ids.length === 0) return;

    if (col === COL_FACT) {
      const resolve = (raw: string): CreationFacturation | null => {
        const t = raw.trim().toLowerCase();
        const opt = FACT_OPTIONS.find((o) =>
          o.label.toLowerCase() === t || o.key.toLowerCase() === t
        );
        return opt?.key ?? null;
      };
      const targets: Array<{ id: string; etat: CreationFacturation }> = [];
      if (lines.length === 1) {
        const etat = resolve(lines[0]);
        if (!etat) return;
        for (const id of ids) targets.push({ id, etat });
      } else {
        for (let i = 0; i < ids.length && i < lines.length; i++) {
          const etat = resolve(lines[i]);
          if (!etat) continue;
          targets.push({ id: ids[i], etat });
        }
      }
      if (targets.length === 0) return;
      setLocalRows((prev) =>
        prev.map((r) => {
          const t = targets.find((x) => x.id === r.id);
          if (!t) return r;
          return { ...r, creation_facturation: t.etat };
        })
      );
      startTransition(async () => {
        try {
          await Promise.all(targets.map((t) => setCreationFacturation(t.id, t.etat)));
          toastSuccess(`${targets.length} facturation${targets.length > 1 ? "s" : ""} collée${targets.length > 1 ? "s" : ""}`);
          clearSelection();
          router.refresh();
        } catch (e) {
          toastError(e, "Echec collage");
          router.refresh();
        }
      });
      return;
    }
    // Branche STATUT (col === COL_STATUT)
    // Map des libelles vers statut keys
    const byLabel = new Map<string, CreationStatut | null>();
    for (const def of STATUT_DEF) {
      byLabel.set(def.label.toLowerCase(), def.key === "non_demarre" ? null : (def.key as CreationStatut));
    }
    const updates = new Map<CreationStatut | null, string[]>(); // statut -> ids
    if (lines.length === 1) {
      // Fill-all : applique la meme valeur a toutes les selected
      const target = byLabel.get(lines[0].trim().toLowerCase());
      if (target === undefined) return; // libelle inconnu, on abandonne
      updates.set(target, ids);
    } else {
      // Positional : ligne N <-> id selected[N]
      for (let i = 0; i < ids.length && i < lines.length; i++) {
        const target = byLabel.get(lines[i].trim().toLowerCase());
        if (target === undefined) continue;
        if (!updates.has(target)) updates.set(target, []);
        updates.get(target)!.push(ids[i]);
      }
    }
    if (updates.size === 0) return;
    // Optimistic (+ auto-facturation pour KBIS reçu)
    const flatTargets = new Map<string, CreationStatut | null>();
    for (const [statut, idsList] of updates) {
      for (const id of idsList) flatTargets.set(id, statut);
    }
    setLocalRows((prev) =>
      prev.map((r) => {
        if (!flatTargets.has(r.id)) return r;
        const next = flatTargets.get(r.id)!;
        const fac =
          next === "actee_kbis_recu" && r.creation_facturation === null
            ? ("a_facturer" as CreationFacturation)
            : r.creation_facturation;
        return { ...r, creation_statut: next, creation_facturation: fac };
      })
    );
    startTransition(async () => {
      try {
        for (const [statut, idsList] of updates) {
          await bulkSetCreationStatut(idsList, statut);
        }
        toastSuccess(`${flatTargets.size} dossier${flatTargets.size > 1 ? "s" : ""} collé${flatTargets.size > 1 ? "s" : ""}`);
        clearSelection();
      } catch (e) {
        toastError(e, "Echec collage");
        router.refresh();
      }
    });
  }

  const {
    selectedIds,
    selectedCount,
    activeCol,
    focusedPos,
    isSelected,
    onCellClick,
    clearSelection,
    selectAll,
    selectOne,
  } = useColumnSelection(gridIds, {
    onCopy: (ids, col) => {
      const text = buildCopyText(col);
      if (!text) return;
      navigator.clipboard?.writeText?.(text).then(() => {
        toastSuccess(`${ids.length} cellule${ids.length > 1 ? "s" : ""} copiée${ids.length > 1 ? "s" : ""}`);
      }).catch(() => {});
    },
    onPaste: (text, ids, col) => applyPasteText(text, ids, col),
  });

  // ============================================================================
  // Actions
  // ============================================================================

  function onToggleSubscription(clientId: string, annee: number) {
    // Optimistic : on bascule l'annee (1 max par client)
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientId) return r;
        if (r.creation_annee === annee) {
          return { ...r, creation_annee: null, creation_statut: null };
        }
        return {
          ...r,
          creation_annee: annee,
          creation_statut: r.creation_statut ?? "a_traiter",
        };
      })
    );
    startTransition(async () => {
      try {
        await toggleCreationSubscription(clientId, annee);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec sauvegarde");
        router.refresh();
      }
    });
  }

  function onSetStatut(clientId: string, statut: CreationStatut | null) {
    setLocalRows((prev) =>
      prev.map((r) => {
        if (r.id !== clientId) return r;
        // Auto-facturation : passage en actee_kbis_recu + facturation null
        // -> 'a_facturer' (cf. trigger DB 0058). On replique cote optimistic.
        const fac =
          statut === "actee_kbis_recu" && r.creation_facturation === null
            ? ("a_facturer" as CreationFacturation)
            : r.creation_facturation;
        return { ...r, creation_statut: statut, creation_facturation: fac };
      })
    );
    startTransition(async () => {
      try {
        await setCreationStatut(clientId, statut);
      } catch (e) {
        toastError(e, "Echec sauvegarde statut");
        router.refresh();
      }
    });
  }

  function onSetFacturation(clientId: string, fac: CreationFacturation | null) {
    setLocalRows((prev) =>
      prev.map((r) => (r.id === clientId ? { ...r, creation_facturation: fac } : r))
    );
    startTransition(async () => {
      try {
        await setCreationFacturation(clientId, fac);
      } catch (e) {
        toastError(e, "Echec sauvegarde facturation");
        router.refresh();
      }
    });
  }

  // value = key statut OU etat_facturation. Le type est determine par activeCol.
  function onBulkApply(value: string) {
    if (activeCol === null) return;
    const ids = rowIdsFromSelection();
    if (ids.length === 0) return;

    if (activeCol === COL_FACT) {
      const etat = value as CreationFacturation;
      setLocalRows((prev) =>
        prev.map((r) => (ids.includes(r.id) ? { ...r, creation_facturation: etat } : r))
      );
      startTransition(async () => {
        try {
          await Promise.all(ids.map((id) => setCreationFacturation(id, etat)));
          toastSuccess(`${ids.length} facturation${ids.length > 1 ? "s" : ""} mise${ids.length > 1 ? "s" : ""} à jour`);
          clearSelection();
          router.refresh();
        } catch (e) {
          toastError(e, "Echec mise à jour facturation");
          router.refresh();
        }
      });
      return;
    }

    // activeCol === COL_STATUT
    const statutKey = value;
    const target = statutKey === "non_demarre" ? null : (statutKey as CreationStatut);
    setLocalRows((prev) =>
      prev.map((r) => {
        if (!ids.includes(r.id)) return r;
        const fac =
          target === "actee_kbis_recu" && r.creation_facturation === null
            ? ("a_facturer" as CreationFacturation)
            : r.creation_facturation;
        return { ...r, creation_statut: target, creation_facturation: fac };
      })
    );
    startTransition(async () => {
      try {
        const res = await bulkSetCreationStatut(ids, target);
        toastSuccess(`${res.updated} dossier${res.updated > 1 ? "s" : ""} mis à jour`);
        clearSelection();
      } catch (e) {
        toastError(e, "Echec mise à jour groupée");
        router.refresh();
      }
    });
  }

  // ============================================================================
  // Recap par annee : compteurs par groupe (a faire / en cours / termine)
  // ============================================================================
  const yearRecap = useMemo(() => {
    const map = new Map<number, { a_faire: number; en_cours: number; termine: number }>();
    for (const r of localRows) {
      if (!r.creation_annee) continue;
      const g = defFor(r.creation_statut).group;
      if (!map.has(r.creation_annee)) map.set(r.creation_annee, { a_faire: 0, en_cours: 0, termine: 0 });
      map.get(r.creation_annee)![g]++;
    }
    return map;
  }, [localRows]);

  // Annees a afficher dans le recap : toutes celles qui ont au moins 1 dossier
  // souscrit + la fenetre 3-ans. Tri descendant.
  const recapYears = useMemo(() => {
    const set = new Set<number>();
    for (const r of localRows) {
      if (r.creation_annee) set.add(r.creation_annee);
    }
    for (const y of years) set.add(y);
    return [...set].sort((a, b) => b - a);
  }, [localRows, years]);

  // URL helpers
  function urlForBase(c: number = center) {
    return `/missions/creations?view=base&center=${c}`;
  }
  function urlForYear(y: number) {
    return `/missions/creations?year=${y}`;
  }
  const prevCenter = center - 1;
  const nextCenter = center + 1;
  const urlPrev = mode === "year" ? urlForYear(prevCenter) : urlForBase(prevCenter);
  const urlNext = mode === "year" ? urlForYear(nextCenter) : urlForBase(nextCenter);

  return (
    <div className={cn("space-y-3", isPending && "opacity-95")}>
      {/* Onglets Base / Annee */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav
          aria-label="Vue créations"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]"
        >
          <Link
            href={urlForBase()}
            aria-current={mode === "base" ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-all",
              mode === "base"
                ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 font-semibold"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
            )}
          >
            Base
          </Link>
          <Link
            href={urlPrev}
            aria-label="Année précédente"
            title={`Reculer (${prevCenter - 1} à ${prevCenter + 1})`}
            className="px-1.5 py-1.5 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          {years.map((y) => {
            const active = mode === "year" && y === selectedYear;
            return (
              <Link
                key={y}
                href={urlForYear(y)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-all tabular-nums",
                  active
                    ? "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] border border-transparent"
                )}
              >
                {y}
              </Link>
            );
          })}
          <Link
            href={urlNext}
            aria-label="Année suivante"
            title={`Avancer (${nextCenter - 1} à ${nextCenter + 1})`}
            className="px-1.5 py-1.5 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>

        {/* Filtres par groupe de statut : visible en vue Annee uniquement */}
        {mode === "year" && (
          <div className="flex items-center gap-1">
            <StatusFilterChip label="Tous" count={yearRows.length} active={filter.size === 0} onClick={() => setFilter(new Set())} />
            <StatusFilterChip label="À faire" count={yearCounts.a_faire} active={filter.has("a_faire")} onClick={(e) => setFilter(toggleFilterKey(filter, "a_faire", e))} accent="amber" />
            <StatusFilterChip label="En cours" count={yearCounts.en_cours} active={filter.has("en_cours")} onClick={(e) => setFilter(toggleFilterKey(filter, "en_cours", e))} accent="sky" />
            <StatusFilterChip label="Terminé" count={yearCounts.termine} active={filter.has("termine")} onClick={(e) => setFilter(toggleFilterKey(filter, "termine", e))} accent="emerald" />
          </div>
        )}
      </div>

      {/* Recap par annee : compteurs */}
      {recapYears.length > 0 && (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-2">
            Recap par année
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {recapYears.slice(0, 3).map((y) => {
              const stats = yearRecap.get(y) ?? { a_faire: 0, en_cours: 0, termine: 0 };
              const total = stats.a_faire + stats.en_cours + stats.termine;
              const pct = total > 0 ? Math.round((stats.termine / total) * 100) : 0;
              return (
                <Link
                  key={y}
                  href={urlForYear(y)}
                  className={cn(
                    "rounded-md border p-2 transition-colors",
                    mode === "year" && y === selectedYear
                      ? "border-zinc-400 dark:border-zinc-500 bg-zinc-50 dark:bg-white/[0.04]"
                      : "border-zinc-200/70 dark:border-white/[0.06] hover:border-zinc-300 dark:hover:border-white/[0.12] bg-white dark:bg-transparent"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{y}</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">{total} dossier{total > 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] tabular-nums mt-1">
                    <span className={cn(stats.a_faire > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
                      {stats.a_faire} à faire
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span className={cn(stats.en_cours > 0 ? "text-sky-600 dark:text-sky-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
                      {stats.en_cours} en cours
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span className={cn(stats.termine > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-zinc-400 dark:text-zinc-500")}>
                      {stats.termine} fait
                    </span>
                    <span className="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden mt-1">
                    <div className="h-full bg-emerald-500 dark:bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      {visibleRows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {localRows.length === 0
            ? "Aucun dossier en création."
            : mode === "year"
              ? `Aucun dossier souscrit à l'exercice ${selectedYear}. Passe en vue « Base » pour souscrire une année.`
              : "Aucun dossier visible."}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] overflow-x-auto">
          <table
            className="w-full text-sm min-w-[720px] focus:outline-none"
            aria-label="Dossiers en création"
          >
            <thead className="bg-zinc-50/50 dark:bg-white/[0.02] border-b border-zinc-200/70 dark:border-white/[0.06]">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Société</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[100px]">Forme</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[180px]">Pipeline</th>
                {mode === "base" ? (
                  <th scope="col" className="px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[260px]">Année · clic pour souscrire</th>
                ) : (
                  <>
                    <th scope="col" className="px-3 py-2 text-center font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[220px]">Création {selectedYear}</th>
                    <th scope="col" className="px-3 py-2 text-center font-medium text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[140px]">Facturation</th>
                  </>
                )}
                <th scope="col" className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {visibleRows.map((r, rowIdx) => {
                const statutCellId = `${r.id}|STATUT`;
                const factCellId = `${r.id}|FACT`;
                const statutSelected = mode === "year" && isSelected(statutCellId);
                const factSelected = mode === "year" && isSelected(factCellId);
                const statutFocused = mode === "year" && focusedPos?.row === rowIdx && focusedPos?.col === COL_STATUT;
                const factFocused = mode === "year" && focusedPos?.row === rowIdx && focusedPos?.col === COL_FACT;
                return (
                <tr
                  key={r.id}
                  className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {/* Pastille rouge a la racine du dossier :
                          - Vue Annee : creation_statut a_traiter (ou null) pour les dossiers
                            souscrits a l'annee selectionnee. Permet de voir d'un coup
                            d'oeil les creations encore non demarrees.
                          - Vue Base  : meme logique mais on exige creation_annee defini
                            (sinon le dossier n'est pas souscrit du tout - pas de pastille). */}
                      {(r.creation_statut === "a_traiter" || r.creation_statut === null) &&
                        (mode === "year" || (mode === "base" && r.creation_annee !== null)) && (
                          <span
                            aria-label="À traiter"
                            title="Création à traiter"
                            className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                          />
                        )}
                      <Link href={`/clients/${r.slug}`} className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                        {r.denomination}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400 text-[13px]">
                    {r.forme || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">
                    {r.pipeline_statut ? (
                      <span className="text-zinc-600 dark:text-zinc-400">{r.pipeline_statut}</span>
                    ) : (
                      <span className="text-zinc-400 italic">—</span>
                    )}
                  </td>
                  {mode === "base" ? (
                    <td className="px-3 py-2.5">
                      <YearPills
                        years={pillYears ?? years}
                        activeYear={r.creation_annee}
                        onToggle={(year) => onToggleSubscription(r.id, year)}
                      />
                    </td>
                  ) : (
                    <>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-center transition-colors cursor-pointer",
                          statutSelected && "bg-sky-50/80 dark:bg-sky-500/[0.12]",
                          statutFocused && "outline outline-1 outline-sky-400 dark:outline-sky-500 outline-offset-[-2px]"
                        )}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("button, a, input, [role='listbox'], [role='dialog']")) {
                            selectOne(rowIdx, COL_STATUT);
                            return;
                          }
                          onCellClick(rowIdx, COL_STATUT, e);
                        }}
                      >
                        <StatutPicker
                          value={r.creation_statut}
                          onChange={(v) => onSetStatut(r.id, v)}
                        />
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-center transition-colors cursor-pointer",
                          factSelected && "bg-sky-50/80 dark:bg-sky-500/[0.12]",
                          factFocused && "outline outline-1 outline-sky-400 dark:outline-sky-500 outline-offset-[-2px]"
                        )}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("button, a, input, [role='listbox'], [role='dialog']")) {
                            selectOne(rowIdx, COL_FACT);
                            return;
                          }
                          onCellClick(rowIdx, COL_FACT, e);
                        }}
                      >
                        <FacturationPicker
                          value={r.creation_facturation}
                          onChange={(v) => onSetFacturation(r.id, v)}
                        />
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2.5 text-right">
                    <Link
                      href={`/clients/${r.slug}`}
                      className="inline-flex items-center justify-center p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors"
                      aria-label={`Ouvrir la fiche ${r.denomination}`}
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

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {visibleRows.length} dossier{visibleRows.length > 1 ? "s" : ""}
          {mode === "year"
            ? ` souscrit${visibleRows.length > 1 ? "s" : ""} à l'exercice ${selectedYear}`
            : " en cours de création"}
          {localRows.length !== visibleRows.length && ` (sur ${localRows.length} au total)`}.
        </p>
        {mode === "year" && visibleRows.length > 0 && (
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            Tout sélectionner
          </button>
        )}
      </div>

      {/* Barre d'action bulk : sticky en bas, visible si selection > 0 */}
      <BulkActionBar
        count={selectedCount}
        onClear={clearSelection}
        hint={
          activeCol === COL_STATUT ? "Colonne Statut · ↑↓ nav · ← → change · shift+clic étend"
          : activeCol === COL_FACT ? "Colonne Facturation · ↑↓ nav · ← → change · shift+clic étend"
          : "clic une cellule pour commencer"
        }
        label={activeCol === COL_FACT ? "Facturation" : "Statut"}
        options={
          activeCol === COL_FACT
            ? FACT_OPTIONS.map((o) => ({
                key: o.key,
                label: o.label,
                color: o.color,
              }))
            : STATUT_DEF.map((s) => ({
                key: s.key,
                label: s.label,
                color: s.color,
                group: s.group === "a_faire" ? "À faire" : s.group === "en_cours" ? "En cours" : "Terminé",
              }))
        }
        onApply={onBulkApply}
      />
    </div>
  );
}

// ============================================================================
// YearPills : 1 seule annee active max (radio behavior)
// ============================================================================

function YearPills({
  years,
  activeYear,
  onToggle,
}: {
  years: number[];
  activeYear: number | null;
  onToggle: (year: number) => void;
}) {
  // Grid 3 colonnes compact -> ~6 ans tiennent sur 2 lignes.
  return (
    <div className="inline-grid grid-cols-3 gap-1 max-w-[160px]">
      {years.map((y) => {
        const isActive = activeYear === y;
        return (
          <button
            key={y}
            type="button"
            onClick={() => onToggle(y)}
            className={cn(
              "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all tabular-nums",
              isActive
                ? "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-500/40"
                : "bg-white dark:bg-white/[0.02] text-zinc-600 dark:text-zinc-400 border-dashed border-zinc-300 dark:border-white/[0.10] hover:border-zinc-400 dark:hover:border-white/[0.20] hover:text-zinc-900 dark:hover:text-zinc-100"
            )}
          >
            {y}
          </button>
        );
      })}
      {activeYear !== null && !years.includes(activeYear) && (
        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium border tabular-nums bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-500/40">
          {activeYear}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// StatutPicker Notion-like
// ============================================================================

function StatutPicker({
  value,
  onChange,
}: {
  value: CreationStatut | null;
  onChange: (v: CreationStatut | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = defFor(value);

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = 320;
    const POPOVER_WIDTH = 240;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const desiredLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    const left = Math.max(MARGIN, Math.min(desiredLeft, window.innerWidth - MARGIN - POPOVER_WIDTH));
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open]);

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

  const groups: Array<{ key: "a_faire" | "en_cours" | "termine"; label: string; items: typeof STATUT_DEF }> = [
    { key: "a_faire", label: "À faire", items: STATUT_DEF.filter((s) => s.group === "a_faire") },
    { key: "en_cours", label: "En cours", items: STATUT_DEF.filter((s) => s.group === "en_cours") },
    { key: "termine", label: "Terminé", items: STATUT_DEF.filter((s) => s.group === "termine") },
  ];

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80 whitespace-nowrap min-w-[140px] justify-center",
          current.color
        )}
      >
        {current.label}
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
            className="min-w-[240px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/[0.06] overflow-hidden animate-slide-up-fade"
          >
            {groups.map((g, gi) => (
              <div key={g.key}>
                <div className={cn(
                  "px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium",
                  gi > 0 && "border-t border-zinc-100 dark:border-white/[0.06] mt-1"
                )}>
                  {g.label}
                </div>
                {g.items.map((s) => {
                  const isActive = (value === null && s.key === "non_demarre") || value === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => {
                        onChange(s.key === "non_demarre" ? null : (s.key as CreationStatut));
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                        isActive && "bg-zinc-50 dark:bg-white/[0.04]"
                      )}
                    >
                      <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", s.color)}>
                        {s.label}
                      </span>
                      {isActive && <Check className="h-3 w-3 text-zinc-500 dark:text-zinc-400 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
// FacturationPicker - picker generique 3 etats (a_facturer / facturee /
// sans_facture). Affiche un placeholder "-" quand null.
// Identique au pattern IR/CAA - cf. ir-table.tsx ligne ~1119.
// ============================================================================

function FacturationPicker({
  value,
  onChange,
}: {
  value: CreationFacturation | null;
  onChange: (v: CreationFacturation | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const current = value ? FACT_OPTIONS.find((o) => o.key === value) : null;

  useEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const POPOVER_HEIGHT = FACT_OPTIONS.length * 32 + 50;
    const POPOVER_WIDTH = 200;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const desiredLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    const left = Math.max(MARGIN, Math.min(desiredLeft, window.innerWidth - MARGIN - POPOVER_WIDTH));
    setPos({ left, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open]);

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
          "inline-flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all hover:opacity-80 min-w-[90px] justify-center",
          current
            ? current.color
            : "bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-500 border-dashed border-zinc-300 dark:border-white/[0.10]"
        )}
      >
        {current ? current.label : "-"}
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
            {FACT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                  value === o.key && "bg-zinc-50 dark:bg-white/[0.04]"
                )}
              >
                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] border", o.color)}>{o.label}</span>
                {value === o.key && <span className="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">✓</span>}
              </button>
            ))}
            {value !== null && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors border-t border-zinc-100 dark:border-white/[0.06]"
              >
                Réinitialiser
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
