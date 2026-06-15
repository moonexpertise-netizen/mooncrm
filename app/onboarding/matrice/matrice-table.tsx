"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Inbox, Minus, Pencil, X } from "lucide-react";
import { cn, statutColorClass } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useHighlightRow } from "@/app/_hooks/use-highlight-row";
import {
  addOnboardingStatusOption,
  deleteOnboardingStatusOption,
  renameOnboardingStatusOption,
  setGestionTns,
  setOrigine,
  updateOnboardingTaskStatus,
} from "@/app/onboarding/actions";

const ORIGINE_VALUES = [
  "1 - Création",
  "2 - Reprise",
  "3 - Reprise sans EC",
  "4 - Interne",
  "5 - Sous-traitance",
] as const;

export type StatutLogique =
  | "A_FAIRE"
  | "EN_COURS"
  | "TERMINE"
  | "NON_APPLICABLE";

export type OnboardingStatusOption = {
  libelle: string;
  statut_logique: StatutLogique;
  color: string | null;
};

export type MatriceTaskCell = {
  id: string;
  statut_logique: StatutLogique;
  statut_detail: string | null;
};

export type MatriceRow = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  forme: string | null;
  origine: string | null;
  gestion_tns: boolean | null;
  /** Tâche par task_key dans l'ordre de TASK_ORDER. null = tâche non créée. */
  tasks: Array<MatriceTaskCell | null>;
  done: number;
  total: number;
};

/**
 * Description d'une colonne (étape) telle que reçue depuis le parcours par
 * défaut. Voir matrice/page.tsx pour le chargement.
 */
export type EtapeColumn = {
  task_key: string;
  nom_court: string; // affiché en entête
  libelle: string; // affiché en tooltip + popover title
};

type OrigineType =
  | "creation"
  | "reprise_ec"
  | "reprise_sans_ec"
  | "interne"
  | "soustraitance"
  | "autre";
const TYPE_LABEL: Record<OrigineType, string> = {
  creation: "Création",
  reprise_ec: "Reprise avec EC",
  reprise_sans_ec: "Reprise sans EC",
  interne: "Interne",
  soustraitance: "ST",
  autre: "Autre",
};
const TYPE_PILL: Record<OrigineType, string> = {
  creation: "bg-sky-50 text-sky-800 border-sky-300",
  reprise_ec: "bg-violet-50 text-violet-800 border-violet-300",
  reprise_sans_ec: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300",
  interne: "bg-amber-50 text-amber-800 border-amber-300",
  soustraitance: "bg-zinc-100 text-zinc-700 border-zinc-300",
  autre: "bg-zinc-50 text-zinc-500 border-zinc-200",
};
function origineToType(origine: string | null): OrigineType {
  if (!origine) return "autre";
  if (origine === "1 - Création") return "creation";
  if (origine === "2 - Reprise") return "reprise_ec";
  if (origine === "3 - Reprise sans EC") return "reprise_sans_ec";
  if (origine === "4 - Interne") return "interne";
  if (origine === "5 - Sous-traitance") return "soustraitance";
  return "autre";
}

type TypeFilter = "all" | OrigineType;
type TnsFilter = "all" | "tns" | "non_tns" | "undecided";
type StatusFilter = "all" | "in_progress" | "not_started" | "complete";
type SortMode = "pct" | "nom";

const STATUT_GROUP_ORDER: StatutLogique[] = ["A_FAIRE", "EN_COURS", "TERMINE", "NON_APPLICABLE"];
const STATUT_GROUP_LABEL: Record<StatutLogique, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  NON_APPLICABLE: "N/A",
};

/**
 * Tableau matriciel de l'onboarding avec édition inline.
 *
 *  - Première colonne sticky : client + chip Type + chip TNS cliquable
 *  - 13 colonnes étroites : 1 par task_key dans l'ordre canonique
 *  - Cellule : pastille couleur (cliquable → popover statut)
 *  - Dernière colonne : score done/total + barre mini
 *  - Filtres : Type, TNS, recherche · Tri : auto / progression / nom / type
 *
 * Toutes les modifications passent par les server actions
 * `updateOnboardingTaskStatus` et `setGestionTns`, avec optimistic update.
 * `router.refresh()` est appelé après toute action qui peut créer de nouvelles
 * tâches (toggle TNS), pour que les nouvelles colonnes peuplent.
 */
export default function MatriceTable({
  rows,
  etapes,
  optionsByKey,
}: {
  rows: MatriceRow[];
  /** Colonnes de la matrice = étapes du parcours par défaut, dans l'ordre. */
  etapes: EtapeColumn[];
  optionsByKey: Record<string, OnboardingStatusOption[]>;
}) {
  const router = useRouter();
  // Filtres persistés dans l'URL (cf. /onboarding qui fait pareil) : F5 et
  // switch d'onglet Liste ↔ Matrice ne perdent rien.
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // URL courante pour ?from= sur les liens fiche client (retour intelligent).
  const fromUrl = useMemo(() => {
    const qs = searchParams.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }, [pathname, searchParams]);

  // Highlight + scroll-to-row au retour depuis une fiche client
  useHighlightRow("client");

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(
    () => (searchParams.get("type") as TypeFilter) || "all"
  );
  const [tnsFilter, setTnsFilter] = useState<TnsFilter>(
    () => (searchParams.get("tns") as TnsFilter) || "all"
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (searchParams.get("status") as StatusFilter) || "all"
  );
  const [sortMode, setSortMode] = useState<SortMode>(
    () => (searchParams.get("sort") as SortMode) || "pct"
  );

  // Sync state → URL (debounced 200ms)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (tnsFilter !== "all") params.set("tns", tnsFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sortMode !== "pct") params.set("sort", sortMode);
    const qs = params.toString();
    router.replace(`/onboarding/matrice${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, typeFilter, tnsFilter, statusFilter, sortMode, router]);

  useEffect(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(writeParams, 200);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [writeParams]);

  // State local + sync via prop : pattern plus fiable que React useOptimistic
  // ici, parce que useOptimistic revert à la fin de la transition or
  // router.refresh() ne bloque pas la transition. Cf. editable.tsx qui
  // utilise exactement ce pattern depuis longtemps en prod.
  type Patch =
    | { kind: "task"; clientId: string; taskIdx: number; statut_logique: StatutLogique; statut_detail: string | null }
    | { kind: "tns"; clientId: string; gestion_tns: boolean | null }
    | { kind: "origine"; clientId: string; origine: string | null };

  const [localRows, setLocalRows] = useState<MatriceRow[]>(rows);
  // Re-sync quand le serveur revient avec de nouvelles données (router.refresh)
  useEffect(() => setLocalRows(rows), [rows]);

  function applyPatch(patch: Patch) {
    setLocalRows((state) =>
      state.map((r) => {
        if (r.id !== patch.clientId) return r;
        if (patch.kind === "tns") return { ...r, gestion_tns: patch.gestion_tns };
        if (patch.kind === "origine") return { ...r, origine: patch.origine };
        // patch.kind === "task"
        const cell = r.tasks[patch.taskIdx];
        if (!cell) return r;
        const newCell: MatriceTaskCell = {
          ...cell,
          statut_logique: patch.statut_logique,
          statut_detail: patch.statut_detail,
        };
        const newTasks = [...r.tasks];
        newTasks[patch.taskIdx] = newCell;
        // recompute done/total
        let done = 0;
        let total = 0;
        for (const c of newTasks) {
          if (c === null) continue;
          total++;
          if (c.statut_logique === "TERMINE" || c.statut_logique === "NON_APPLICABLE") done++;
        }
        return { ...r, tasks: newTasks, done, total };
      })
    );
  }

  const [, startTransition] = useTransition();

  // Pattern : (1) applyPatch immédiat = UI met à jour tout de suite,
  // (2) action serveur en transition, (3) router.refresh propage la donnée
  // serveur → useEffect resync localRows. Si le refresh ne s'est pas
  // propagé immédiatement, le state local reste correct (pas de revert).
  function onPickStatus(
    clientId: string,
    taskIdx: number,
    taskId: string,
    libelle: string,
    statut_logique: StatutLogique
  ) {
    applyPatch({ kind: "task", clientId, taskIdx, statut_logique, statut_detail: libelle });
    setOpenPicker(null);
    startTransition(async () => {
      try {
        await updateOnboardingTaskStatus(taskId, libelle);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de la mise a jour du statut");
      }
    });
  }

  function onResetStatus(clientId: string, taskIdx: number, taskId: string) {
    applyPatch({ kind: "task", clientId, taskIdx, statut_logique: "A_FAIRE", statut_detail: null });
    setOpenPicker(null);
    startTransition(async () => {
      try {
        await updateOnboardingTaskStatus(taskId, null);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de la reinitialisation");
      }
    });
  }

  function onSetTns(clientId: string, value: boolean | null) {
    applyPatch({ kind: "tns", clientId, gestion_tns: value });
    setOpenTnsPicker(null);
    startTransition(async () => {
      try {
        await setGestionTns(clientId, value);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de la mise a jour TNS");
      }
    });
  }

  function onSetOrigineRow(clientId: string, value: string | null) {
    applyPatch({ kind: "origine", clientId, origine: value });
    setOpenOriginePicker(null);
    startTransition(async () => {
      try {
        await setOrigine(clientId, value);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de la mise a jour de l'origine");
      }
    });
  }

  // Picker state : 1 popover global (1 ouvert à la fois)
  const [openPicker, setOpenPicker] = useState<{ clientId: string; taskIdx: number } | null>(null);
  const [openTnsPicker, setOpenTnsPicker] = useState<string | null>(null);
  const [openOriginePicker, setOpenOriginePicker] = useState<string | null>(null);

  const annotated = useMemo(
    () => localRows.map((r) => ({ ...r, type: origineToType(r.origine) })),
    [localRows]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return annotated.filter((r) => {
      if (s) {
        const hay = `${r.denomination} ${r.siren ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (tnsFilter === "tns" && r.gestion_tns !== true) return false;
      if (tnsFilter === "non_tns" && r.gestion_tns !== false) return false;
      if (tnsFilter === "undecided" && r.gestion_tns !== null) return false;
      if (statusFilter !== "all") {
        if (r.total === 0) return false;
        if (statusFilter === "complete" && r.done !== r.total) return false;
        if (statusFilter === "in_progress" && (r.done === 0 || r.done === r.total)) return false;
        if (statusFilter === "not_started" && r.done !== 0) return false;
      }
      return true;
    });
  }, [annotated, search, typeFilter, tnsFilter, statusFilter]);

  // Tri (cohérent avec la vue Liste) :
  //   - "pct" : pct croissant (à finir en haut, terminés en bas, sans tâches à la fin)
  //   - "nom" : alphabétique
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortMode === "pct") {
      arr.sort((a, b) => {
        if (a.total === 0 && b.total === 0) return a.denomination.localeCompare(b.denomination, "fr");
        if (a.total === 0) return 1;
        if (b.total === 0) return -1;
        const pa = a.done / a.total;
        const pb = b.done / b.total;
        if (pa !== pb) return pa - pb;
        return a.denomination.localeCompare(b.denomination, "fr");
      });
    } else {
      arr.sort((a, b) => a.denomination.localeCompare(b.denomination, "fr"));
    }
    return arr;
  }, [filtered, sortMode]);

  // Compteurs par type (sur tout l'ensemble, pour les pills)
  const typeCounts = useMemo(() => {
    const c = {
      all: annotated.length,
      creation: 0,
      reprise_ec: 0,
      reprise_sans_ec: 0,
      interne: 0,
      soustraitance: 0,
      autre: 0,
    };
    for (const r of annotated) c[r.type]++;
    return c;
  }, [annotated]);

  const tnsCounts = useMemo(() => {
    const c = { all: annotated.length, tns: 0, non_tns: 0, undecided: 0 };
    for (const r of annotated) {
      if (r.gestion_tns === true) c.tns++;
      else if (r.gestion_tns === false) c.non_tns++;
      else c.undecided++;
    }
    return c;
  }, [annotated]);

  const statusCounts = useMemo(() => {
    const c = { all: annotated.length, in_progress: 0, not_started: 0, complete: 0 };
    for (const r of annotated) {
      if (r.total === 0) continue;
      if (r.done === r.total) c.complete++;
      else if (r.done === 0) c.not_started++;
      else c.in_progress++;
    }
    return c;
  }, [annotated]);

  // Stats par colonne (taux de complétion d'une tâche sur les dossiers triés/filtrés)
  const colStats = useMemo(() => {
    return etapes.map((_, i) => {
      let done = 0;
      let total = 0;
      for (const r of sorted) {
        const cell = r.tasks[i];
        if (cell === null) continue;
        total++;
        if (cell.statut_logique === "TERMINE" || cell.statut_logique === "NON_APPLICABLE") done++;
      }
      return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
  }, [sorted, etapes]);

  return (
    <div className="space-y-3">
      {/* Toolbar unifiée (mêmes filtres et tri que la vue Liste) */}
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card px-3 py-2.5 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Filtrer par nom ou SIREN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all hover:border-zinc-300 dark:hover:border-white/[0.16] focus:outline-none focus:border-zinc-900 dark:focus:border-white/[0.30] focus:ring-4 focus:ring-zinc-900/[0.07] dark:focus:ring-white/[0.04]"
        />
        <div className="h-6 w-px bg-zinc-200 dark:bg-white/[0.08] mx-1" />
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Type :</span>
        <FilterChip label="Tous" active={typeFilter === "all"} count={typeCounts.all} onClick={() => setTypeFilter("all")} />
        <FilterChip label="Création" active={typeFilter === "creation"} count={typeCounts.creation} type="creation" onClick={() => setTypeFilter("creation")} />
        <FilterChip label="Reprise avec EC" active={typeFilter === "reprise_ec"} count={typeCounts.reprise_ec} type="reprise_ec" onClick={() => setTypeFilter("reprise_ec")} />
        <FilterChip label="Reprise sans EC" active={typeFilter === "reprise_sans_ec"} count={typeCounts.reprise_sans_ec} type="reprise_sans_ec" onClick={() => setTypeFilter("reprise_sans_ec")} />
        <FilterChip label="Interne" active={typeFilter === "interne"} count={typeCounts.interne} type="interne" onClick={() => setTypeFilter("interne")} />
        <FilterChip label="ST" active={typeFilter === "soustraitance"} count={typeCounts.soustraitance} type="soustraitance" onClick={() => setTypeFilter("soustraitance")} />
        <div className="h-6 w-px bg-zinc-200 dark:bg-white/[0.08] mx-1" />
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">TNS :</span>
        <FilterChip label="Tous" active={tnsFilter === "all"} count={tnsCounts.all} onClick={() => setTnsFilter("all")} />
        <FilterChip label="TNS" active={tnsFilter === "tns"} count={tnsCounts.tns} tone="emerald" onClick={() => setTnsFilter("tns")} />
        <FilterChip label="Non TNS" active={tnsFilter === "non_tns"} count={tnsCounts.non_tns} tone="zinc" onClick={() => setTnsFilter("non_tns")} />
        {tnsCounts.undecided > 0 && (
          <FilterChip label="?" active={tnsFilter === "undecided"} count={tnsCounts.undecided} tone="amber" onClick={() => setTnsFilter("undecided")} />
        )}
        <div className="h-6 w-px bg-zinc-200 dark:bg-white/[0.08] mx-1" />
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Statut :</span>
        <FilterChip label="Tous" active={statusFilter === "all"} count={statusCounts.all} onClick={() => setStatusFilter("all")} />
        <FilterChip label="En cours" active={statusFilter === "in_progress"} count={statusCounts.in_progress} tone="amber" onClick={() => setStatusFilter("in_progress")} />
        <FilterChip label="Pas commencé" active={statusFilter === "not_started"} count={statusCounts.not_started} tone="rose" onClick={() => setStatusFilter("not_started")} />
        <FilterChip label="Terminé" active={statusFilter === "complete"} count={statusCounts.complete} tone="emerald" onClick={() => setStatusFilter("complete")} />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Tri :</span>
          <SortBtn label="Progression" active={sortMode === "pct"} onClick={() => setSortMode("pct")} />
          <SortBtn label="Nom" active={sortMode === "nom"} onClick={() => setSortMode("nom")} />
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums ml-2">
            {sorted.length} dossier{sorted.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Tableau */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card flex flex-col items-center justify-center text-center py-10">
          <Inbox className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Aucun dossier
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Aucun dossier ne correspond aux filtres.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-x-auto -mx-3 md:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
          <table className="text-sm border-separate border-spacing-0" style={{ minWidth: "min(900px, max-content)" }}>
            <thead>
              {/* Numéro + label de colonne */}
              <tr className="bg-zinc-50">
                <th
                  className="sticky left-0 z-20 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-700 border-b border-r border-zinc-200"
                  style={{ minWidth: 260 }}
                >
                  Dossier
                </th>
                {etapes.map((e, i) => (
                  <th
                    key={e.task_key}
                    className="px-1 py-2 text-center text-[10px] font-medium text-zinc-600 border-b border-zinc-200 align-bottom"
                    title={e.libelle}
                    style={{ minWidth: 60 }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-zinc-400 tabular-nums">{i + 1}</span>
                      <span className="leading-tight text-[10px] text-zinc-700">
                        {e.nom_court}
                      </span>
                    </div>
                  </th>
                ))}
                <th
                  className="px-2 py-2 text-center text-xs font-medium text-zinc-700 border-b border-l border-zinc-200"
                  style={{ minWidth: 110 }}
                >
                  Progression
                </th>
              </tr>
              {/* Stats par colonne */}
              <tr className="bg-zinc-50/50">
                <th className="sticky left-0 z-20 bg-zinc-50/50 px-3 py-1 text-left text-[10px] font-medium text-zinc-400 border-b border-r border-zinc-200">
                  % terminé / colonne
                </th>
                {colStats.map((s, i) => (
                  <th
                    key={i}
                    className="px-1 py-1 text-center text-[10px] tabular-nums font-medium border-b border-zinc-200"
                  >
                    <span
                      className={cn(
                        s.total === 0
                          ? "text-zinc-300"
                          : s.pct >= 100
                          ? "text-emerald-600"
                          : s.pct >= 50
                          ? "text-amber-600"
                          : "text-rose-600"
                      )}
                    >
                      {s.total > 0 ? `${s.pct}%` : "-"}
                    </span>
                  </th>
                ))}
                <th className="border-b border-l border-zinc-200" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => (
                <tr
                  key={r.id}
                  id={`client-${r.slug}`}
                  className={cn(
                    "group/row transition-colors bg-white",
                    "hover:bg-zinc-50"
                  )}
                >
                  {/* Sticky : client + chips Type + TNS */}
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-2 border-b border-r border-zinc-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/clients/${r.slug}/onboarding?from=${encodeURIComponent(fromUrl)}`}
                        className="text-sm font-medium text-zinc-900 hover:underline truncate"
                      >
                        {r.denomination}
                      </Link>
                      <OrigineChip
                        origine={r.origine}
                        isOpen={openOriginePicker === r.id}
                        onOpen={() => setOpenOriginePicker(r.id)}
                        onClose={() => setOpenOriginePicker(null)}
                        onSet={(v) => onSetOrigineRow(r.id, v)}
                      />
                      <TnsChip
                        value={r.gestion_tns}
                        isOpen={openTnsPicker === r.id}
                        onOpen={() => setOpenTnsPicker(r.id)}
                        onClose={() => setOpenTnsPicker(null)}
                        onSet={(v) => onSetTns(r.id, v)}
                      />
                    </div>
                    <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                      {r.siren && <span className="tabular-nums">{r.siren}</span>}
                      {r.forme && <span>· {r.forme}</span>}
                    </div>
                  </td>
                  {/* 13 cellules pastilles cliquables */}
                  {r.tasks.map((cell, i) => (
                    <td
                      key={i}
                      className="px-1 py-1 text-center border-b border-zinc-100 relative"
                    >
                      <MatrixCell
                        cell={cell}
                        taskKey={etapes[i]?.task_key ?? ""}
                        taskLibelle={etapes[i]?.libelle ?? etapes[i]?.task_key ?? ""}
                        options={optionsByKey[etapes[i]?.task_key ?? ""] ?? []}
                        isOpen={
                          openPicker?.clientId === r.id && openPicker.taskIdx === i
                        }
                        onOpen={() => setOpenPicker({ clientId: r.id, taskIdx: i })}
                        onClose={() => setOpenPicker(null)}
                        onPick={(libelle, sl) => {
                          if (cell) onPickStatus(r.id, i, cell.id, libelle, sl);
                        }}
                        onReset={() => {
                          if (cell) onResetStatus(r.id, i, cell.id);
                        }}
                      />
                    </td>
                  ))}
                  {/* Progression */}
                  <td className="px-2 py-2 border-b border-l border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden min-w-[40px]">
                        <div
                          className={cn(
                            "h-full transition-all",
                            r.total === 0
                              ? "bg-zinc-200"
                              : r.done === r.total
                              ? "bg-emerald-500"
                              : "bg-[hsl(var(--gold))]"
                          )}
                          style={{
                            width: r.total > 0 ? `${(r.done / r.total) * 100}%` : "0%",
                          }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-zinc-600 shrink-0 min-w-[34px] text-right">
                        {r.total > 0 ? `${r.done}/${r.total}` : "-"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Légende */}
      <div className="flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap px-1 pt-1">
        <LegendItem statut="TERMINE" label="Terminé" />
        <LegendItem statut="EN_COURS" label="En cours" />
        <LegendItem statut="A_FAIRE" label="À faire" />
        <LegendItem statut="NON_APPLICABLE" label="N/A" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded border border-dashed border-zinc-300" />
          Tâche non créée pour ce dossier
        </span>
      </div>
    </div>
  );
}

// ============================================================================
//  MatrixCell : pastille + popover statut
// ============================================================================

function MatrixCell({
  cell,
  taskKey,
  taskLibelle,
  options,
  isOpen,
  onOpen,
  onClose,
  onPick,
  onReset,
}: {
  cell: MatriceTaskCell | null;
  /** task_key de l'étape (pour créer un nouveau libellé option) */
  taskKey: string;
  /** Libellé complet de la tâche (affiché en titre du popover) */
  taskLibelle: string;
  options: OnboardingStatusOption[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (libelle: string, statut_logique: StatutLogique) => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-cell-button]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_HEIGHT = 280;
    const POPOVER_WIDTH = 260;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
    // Clamp horizontal : evite que le popover sorte du viewport (mobile +
    // cellules sur les bords). Le transform translate(-50%) recentre.
    const rawLeft = rect.left + rect.width / 2;
    const halfW = POPOVER_WIDTH / 2;
    const clampedLeft = Math.max(
      MARGIN + halfW,
      Math.min(rawLeft, window.innerWidth - MARGIN - halfW)
    );
    setPos({
      left: clampedLeft,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // Vérifie le chip ET le popover (portaillé hors du chip)
      if (ref.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  // Tâche absente : pastille pointillée, non cliquable
  if (cell === null) {
    return (
      <span
        className="inline-block w-4 h-4 rounded border border-dashed border-zinc-200"
        title="Tâche non créée pour ce dossier (cf. règles gestion TNS / origine)"
      />
    );
  }

  const grouped = (() => {
    const groups: Record<StatutLogique, OnboardingStatusOption[]> = {
      A_FAIRE: [],
      EN_COURS: [],
      TERMINE: [],
      NON_APPLICABLE: [],
    };
    for (const o of options) groups[o.statut_logique].push(o);
    return groups;
  })();

  const currentLabel = cell.statut_detail ?? statutLabel(cell.statut_logique);
  return (
    <div className="inline-block" ref={ref}>
      <button
        data-cell-button="1"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Statut : ${currentLabel}. Cliquer pour modifier.`}
        className="p-0.5 rounded cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))]"
        title={`${currentLabel} · clic pour modifier`}
      >
        <StatusDot statut={cell.statut_logique} />
      </button>
      {isOpen && pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp
                ? "translate(-50%, calc(-100% - 8px))"
                : "translate(-50%, 8px)",
              zIndex: 1000,
            }}
            className="bg-white dark:bg-[hsl(var(--surface-elevated))] border dark:border-white/[0.10] rounded-lg shadow-xl min-w-[260px] text-left animate-slide-up-fade overflow-hidden"
          >
            {/* Titre + statut actuel */}
            <div className="px-3 py-2 border-b dark:border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                {taskLibelle}
              </div>
              {cell.statut_detail ? (
                <span
                  className={cn(
                    "inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border",
                    statutColorClass(
                      cell.statut_logique,
                      options.find((o) => o.libelle === cell.statut_detail)?.color
                    )
                  )}
                >
                  {cell.statut_detail}
                </span>
              ) : (
                <span className="text-[11px] text-zinc-400">Aucun statut sélectionné</span>
              )}
            </div>
            {/* Options groupées */}
            <div className="max-h-[300px] overflow-y-auto py-1">
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Pas de libellés disponibles. Crée-en un ci-dessous ↓
                </div>
              ) : (
                STATUT_GROUP_ORDER.map((groupKey) => {
                  const opts = grouped[groupKey];
                  if (opts.length === 0) return null;
                  return (
                    <div key={groupKey} className="py-0.5">
                      <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-zinc-400 font-medium">
                        {STATUT_GROUP_LABEL[groupKey]}
                      </div>
                      {opts.map((opt) => (
                        <OptionRow
                          key={opt.libelle}
                          opt={opt}
                          taskKey={taskKey}
                          isSelected={cell.statut_detail === opt.libelle}
                          onPick={() => onPick(opt.libelle, opt.statut_logique)}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
            {/* Création inline d'une nouvelle option (style Notion) */}
            <CreateOptionInline
              taskKey={taskKey}
              onCreated={(libelle, sl) => onPick(libelle, sl)}
            />
            {/* Footer reset */}
            {cell.statut_detail && (
              <div className="border-t dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
                <button
                  onClick={onReset}
                  className="w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Réinitialiser
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  OrigineChip : chip Type cliquable → picker des 5 origines
// ============================================================================

function OrigineChip({
  origine,
  isOpen,
  onOpen,
  onClose,
  onSet,
}: {
  origine: string | null;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSet: (v: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  // Position fixe (sinon clippé par l'overflow horizontal du tableau).
  // Clamp horizontal pour mobile / chips en bord d'ecran.
  useEffect(() => {
    if (!isOpen || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-origine-button]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_HEIGHT = 240;
    const POPOVER_WIDTH = 220;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
    const clampedLeft = Math.max(
      MARGIN,
      Math.min(rect.left, window.innerWidth - MARGIN - POPOVER_WIDTH)
    );
    setPos({
      left: clampedLeft,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  // Le label affiché = type court dérivé de l'origine (cohérent avec les
  // pills de filtre Type juste au-dessus).
  const type = origineToType(origine);

  return (
    <div className="inline-block" ref={ref}>
      <button
        data-origine-button="1"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={origine ? `Origine : ${origine}. Cliquer pour modifier.` : "Origine non renseignée. Cliquer pour définir."}
        className={cn(
          "shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-1",
          TYPE_PILL[type]
        )}
        title={origine ? `Origine : ${origine} · clic pour modifier` : "Origine non renseignée · clic pour modifier"}
      >
        {TYPE_LABEL[type]}
      </button>
      {isOpen && pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)",
              zIndex: 1000,
            }}
            className="bg-white border rounded-lg shadow-xl min-w-[220px] animate-slide-up-fade overflow-hidden"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 border-b">
              Origine du dossier
            </div>
            {ORIGINE_VALUES.map((v) => {
              const t = origineToType(v);
              return (
                <button
                  key={v}
                  onClick={() => onSet(v)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 flex items-center gap-2 transition-colors"
                >
                  <span
                    className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap",
                      TYPE_PILL[t]
                    )}
                  >
                    {v}
                  </span>
                  {origine === v && <span className="text-zinc-400 ml-auto text-xs">✓</span>}
                </button>
              );
            })}
            <div className="border-t">
              <button
                onClick={() => onSet(null)}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                Réinitialiser
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  TnsChip : pastille tri-state cliquable
// ============================================================================

function TnsChip({
  value,
  isOpen,
  onOpen,
  onClose,
  onSet,
}: {
  value: boolean | null;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSet: (v: boolean | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  // Position fixe (sinon le popover est clippé par l'overflow du tableau).
  // Clamp horizontal pour mobile / chips en bord d'ecran.
  useEffect(() => {
    if (!isOpen || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-tns-button]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_HEIGHT = 160;
    const POPOVER_WIDTH = 180;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
    const clampedLeft = Math.max(
      MARGIN,
      Math.min(rect.left, window.innerWidth - MARGIN - POPOVER_WIDTH)
    );
    setPos({
      left: clampedLeft,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  const label = value === true ? "TNS" : value === false ? "Non TNS" : "TNS ?";
  const cls =
    value === true
      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
      : value === false
      ? "bg-zinc-100 text-zinc-600 border-zinc-300"
      : "bg-amber-50 text-amber-700 border-amber-300 border-dashed";

  return (
    <div className="inline-block" ref={ref}>
      <button
        data-tns-button="1"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Gestion TNS : ${label}. Cliquer pour modifier.`}
        className={cn(
          "shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-1",
          cls
        )}
        title="Caractéristique TNS · clic pour modifier"
      >
        {label}
      </button>
      {isOpen && pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)",
              zIndex: 1000,
            }}
            className="bg-white border rounded-lg shadow-xl min-w-[180px] animate-slide-up-fade overflow-hidden"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 border-b">
              Gestion TNS
            </div>
            <button
              onClick={() => onSet(true)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-50/60 flex items-center gap-2 transition-colors"
            >
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] border bg-emerald-50 text-emerald-800 border-emerald-300">
                TNS
              </span>
              {value === true && <span className="text-zinc-400 ml-auto">✓</span>}
            </button>
            <button
              onClick={() => onSet(false)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 flex items-center gap-2 transition-colors"
            >
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] border bg-zinc-100 text-zinc-600 border-zinc-300">
                Non TNS
              </span>
              {value === false && <span className="text-zinc-400 ml-auto">✓</span>}
            </button>
            <div className="border-t">
              <button
                onClick={() => onSet(null)}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                Réinitialiser
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
//  StatusDot : pastille statut
// ============================================================================

function StatusDot({ statut }: { statut: StatutLogique | null }) {
  // sr-only : le statut ne doit pas etre transmis uniquement par couleur.
  // Le texte est invisible visuellement mais lu par les SR (WCAG 2.1).
  const srLabel = statutLabel(statut);
  if (statut === null) {
    return (
      <span className="inline-block w-4 h-4 rounded border border-dashed border-zinc-200 dark:border-white/[0.10]">
        <span className="sr-only">{srLabel}</span>
      </span>
    );
  }
  if (statut === "TERMINE") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40">
        <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-300" strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">{srLabel}</span>
      </span>
    );
  }
  if (statut === "NON_APPLICABLE") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100 dark:bg-white/[0.08] border border-zinc-300 dark:border-white/[0.16]">
        <Minus className="h-3 w-3 text-zinc-500 dark:text-zinc-400" strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">{srLabel}</span>
      </span>
    );
  }
  if (statut === "EN_COURS") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-500/20 border border-sky-300 dark:border-sky-500/40">
        <span className="inline-block w-2 h-2 bg-sky-600 dark:bg-sky-400 rounded-[1px]" aria-hidden="true" />
        <span className="sr-only">{srLabel}</span>
      </span>
    );
  }
  // A_FAIRE
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30">
      <X className="h-3 w-3 text-rose-400 dark:text-rose-300" strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only">{srLabel}</span>
    </span>
  );
}

function statutLabel(s: StatutLogique | null): string {
  if (s === null) return "Tâche non créée";
  if (s === "TERMINE") return "Terminé";
  if (s === "EN_COURS") return "En cours";
  if (s === "A_FAIRE") return "À faire";
  return "N/A";
}

// ============================================================================
//  LegendItem
// ============================================================================

function LegendItem({ statut, label }: { statut: StatutLogique; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot statut={statut} />
      {label}
    </span>
  );
}

// ============================================================================
//  FilterChip + SortBtn
// ============================================================================

function FilterChip({
  label,
  active,
  count,
  type,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  type?: OrigineType;
  tone?: "emerald" | "zinc" | "amber" | "rose";
  onClick: () => void;
}) {
  const toneClass: Record<"emerald" | "zinc" | "amber" | "rose", string> = {
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-300",
    zinc: "bg-zinc-100 text-zinc-700 border-zinc-300",
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    rose: "bg-rose-50 text-rose-800 border-rose-300",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 active:scale-95 inline-flex items-center gap-1.5",
        active && type
          ? `${TYPE_PILL[type]} shadow-sm`
          : active && tone
          ? `${toneClass[tone]} shadow-sm`
          : active
          ? "bg-zinc-100 text-zinc-700 border-zinc-300 shadow-sm"
          : "bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "" : "text-zinc-400")}>{count}</span>
    </button>
  );
}

function SortBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-2 py-0.5 rounded text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1",
        active
          ? "bg-zinc-200 dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 font-semibold border border-zinc-300 dark:border-white/20"
          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-transparent"
      )}
    >
      {label}
    </button>
  );
}

// ============================================================================
//  OptionRow - affichage d'une option du picker + mode edition inline
//  (renommage + suppression). Crayon visible au hover, clic = sélection
//  du statut, clic crayon = mode edition.
// ============================================================================

function OptionRow({
  opt,
  taskKey,
  isSelected,
  onPick,
}: {
  opt: OnboardingStatusOption;
  taskKey: string;
  isSelected: boolean;
  onPick: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(opt.libelle);
  const [draftBucket, setDraftBucket] = useState<StatutLogique>(opt.statut_logique);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Resync draft si l'option change (resync server)
  useEffect(() => {
    if (!editing) {
      setDraft(opt.libelle);
      setDraftBucket(opt.statut_logique);
    }
  }, [opt.libelle, opt.statut_logique, editing]);

  // Focus auto sur l'input en entrant en mode edition
  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editing]);

  // commit avec eventuel changement de bucket
  function commit(nextBucket?: StatutLogique) {
    const trimmed = draft.trim();
    const bucket = nextBucket ?? draftBucket;
    const renamed = trimmed && trimmed !== opt.libelle;
    const bucketChanged = bucket !== opt.statut_logique;
    if (!renamed && !bucketChanged) {
      setEditing(false);
      setDraft(opt.libelle);
      return;
    }
    if (!trimmed) {
      setEditing(false);
      setDraft(opt.libelle);
      return;
    }
    startTransition(async () => {
      try {
        await renameOnboardingStatusOption(
          taskKey,
          opt.libelle,
          trimmed,
          bucketChanged ? bucket : undefined
        );
        toastSuccess(bucketChanged && renamed ? "Libellé modifié" : renamed ? "Libellé renommé" : "Bucket modifié");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de la modification");
        setDraft(opt.libelle);
        setDraftBucket(opt.statut_logique);
      }
    });
  }

  function cancel() {
    setEditing(false);
    setDraft(opt.libelle);
    setDraftBucket(opt.statut_logique);
  }

  function onDelete() {
    if (isPending) return;
    if (!confirm(`Supprimer le libellé « ${opt.libelle} » ? Les tâches qui l'utilisent reviendront à "À faire".`)) return;
    startTransition(async () => {
      try {
        await deleteOnboardingStatusOption(taskKey, opt.libelle);
        toastSuccess("Libellé supprimé");
        router.refresh();
      } catch (e) {
        toastError(e, "Echec suppression");
      }
    });
  }

  // Mini-pills pour choisir le bucket (en mode edition).
  // mouseDown.preventDefault evite que le blur de l'input ferme l'edit
  // avant qu'on click sur la pill.
  function changeBucket(newBucket: StatutLogique) {
    setDraftBucket(newBucket);
    commit(newBucket);
  }

  if (editing) {
    return (
      <div className="px-3 py-1.5 flex flex-col gap-1.5 bg-zinc-50 dark:bg-white/[0.04]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") cancel();
            }}
            disabled={isPending}
            className="flex-1 px-2 py-1 rounded border border-zinc-300 dark:border-white/[0.15] bg-white dark:bg-white/[0.06] text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:focus:ring-white/15"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDelete}
            disabled={isPending}
            title="Supprimer ce libellé"
            className="shrink-0 p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
            aria-label="Supprimer le libellé"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {/* Mini-pills pour deplacer entre buckets */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mr-1">
            Bucket :
          </span>
          {STATUT_GROUP_ORDER.map((b) => (
            <button
              key={b}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => changeBucket(b)}
              disabled={isPending}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors disabled:opacity-50",
                b === draftBucket
                  ? statutColorClass(b, null) + " ring-1 ring-zinc-400 dark:ring-white/30"
                  : "bg-white dark:bg-white/[0.04] text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.10] hover:bg-zinc-100 dark:hover:bg-white/[0.08]"
              )}
              aria-pressed={b === draftBucket}
            >
              {STATUT_GROUP_LABEL[b]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/optrow w-full px-3 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
        isSelected && "bg-zinc-50 dark:bg-white/[0.04]"
      )}
    >
      <button
        type="button"
        onClick={onPick}
        className="flex-1 text-left flex items-center gap-2 min-w-0"
      >
        <span
          className={cn(
            "inline-block px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap",
            statutColorClass(opt.statut_logique, opt.color)
          )}
        >
          {opt.libelle}
        </span>
        {isSelected && <span className="text-zinc-400 dark:text-zinc-500 text-xs">✓</span>}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title="Renommer ce libellé"
        aria-label={`Renommer ${opt.libelle}`}
        className="shrink-0 p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/[0.10] opacity-0 group-hover/optrow:opacity-100 transition-opacity focus:opacity-100"
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

// ============================================================================
//  CreateOptionInline - création inline d'un nouveau libellé depuis la matrice
//  (style Notion). Affiché en bas du popover statut. L'utilisateur tape un
//  texte, choisit un bucket (À faire / En cours / Terminé / N/A), et le
//  libellé est créé en DB puis appliqué immédiatement comme statut de la
//  tâche en cours.
// ============================================================================

function CreateOptionInline({
  taskKey,
  onCreated,
}: {
  taskKey: string;
  onCreated: (libelle: string, statut_logique: StatutLogique) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(statut_logique: StatutLogique) {
    const trimmed = draft.trim();
    if (!trimmed || isPending || !taskKey) return;
    setError(null);
    startTransition(async () => {
      try {
        await addOnboardingStatusOption(taskKey, trimmed, statut_logique);
        setDraft("");
        // Applique le nouveau libellé comme statut courant (optimistic).
        onCreated(trimmed, statut_logique);
        // Re-fetch des options server-side (optionsByKey vient du serveur).
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toastError(e, "Echec de la creation de l'option");
      }
    });
  }

  return (
    <div className="border-t dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.02] px-3 py-2.5 space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">
        Créer une option
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Nom du libellé…"
        disabled={isPending}
        className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:focus:ring-white/15 focus:border-zinc-400 dark:focus:border-zinc-300 disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit("A_FAIRE"); // Enter = À faire par défaut
        }}
      />
      {draft.trim() && (
        <div className="space-y-1">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Ajouter à :
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUT_GROUP_ORDER.map((g) => (
              <button
                key={g}
                onClick={() => submit(g)}
                disabled={isPending}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-medium border transition-colors",
                  "hover:bg-zinc-100 dark:hover:bg-white/[0.08]",
                  "disabled:opacity-50",
                  statutColorClass(g, null)
                )}
              >
                {STATUT_GROUP_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="text-[10px] text-rose-600 dark:text-rose-400">{error}</div>
      )}
    </div>
  );
}
