"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Minus, X } from "lucide-react";
import { cn, statutColorClass } from "@/lib/utils";
import {
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

// Libellés courts pour les en-têtes (colonnes étroites). On garde le mot-clé.
const TASK_SHORT_LABEL: Record<string, string> = {
  tally_crea_pdc: "Tally",
  acces_pennylane: "Pennylane",
  depot_kbis_banque: "KBIS banque",
  confrere: "Confrère",
  abo_moon: "Abo MOON",
  mandat_moon: "Mandat MOON",
  impot_gouv: "impôt.gouv",
  mandat_impots: "Mandat impôts",
  cfe_1447: "CFE 1447",
  ob_pennylane: "OB Pennylane",
  option_ir_is: "IR/IS",
  previ_tns: "Prévi TNS",
  affiliation_tns: "Affiliation TNS",
};

// Libellés longs pour les tooltips
const TASK_LONG_LABEL: Record<string, string> = {
  tally_crea_pdc: "Tally rempli",
  acces_pennylane: "Accès Pennylane créé",
  depot_kbis_banque: "Dépôt KBIS auprès de la banque",
  confrere: "Reprise confrère",
  abo_moon: "Abonnement MOON actif",
  mandat_moon: "Mandat de prélèvement MOON signé",
  impot_gouv: "Accès au compte impôt.gouv",
  mandat_impots: "Mandat des impôts signé et envoyé à la banque",
  cfe_1447: "751-SD ou 1447 CFE signé et déposé sur messagerie",
  ob_pennylane: "Onboarding Pennylane réalisé",
  option_ir_is: "Lettre d'option IR/IS",
  previ_tns: "Prévisionnel TNS réalisé",
  affiliation_tns: "Affiliation TNS réalisée",
};

type OrigineType = "creation" | "reprise" | "interne" | "soustraitance" | "autre";
const TYPE_LABEL: Record<OrigineType, string> = {
  creation: "Création",
  reprise: "Reprise",
  interne: "Interne",
  soustraitance: "Sous-traitance",
  autre: "Autre",
};
const TYPE_PILL: Record<OrigineType, string> = {
  creation: "bg-sky-50 text-sky-800 border-sky-300",
  reprise: "bg-violet-50 text-violet-800 border-violet-300",
  interne: "bg-amber-50 text-amber-800 border-amber-300",
  soustraitance: "bg-zinc-100 text-zinc-700 border-zinc-300",
  autre: "bg-zinc-50 text-zinc-500 border-zinc-200",
};
function origineToType(origine: string | null): OrigineType {
  if (!origine) return "autre";
  if (origine === "1 - Création") return "creation";
  if (origine === "2 - Reprise" || origine === "3 - Reprise sans EC") return "reprise";
  if (origine === "4 - Interne") return "interne";
  if (origine === "5 - Sous-traitance") return "soustraitance";
  return "autre";
}

type TypeFilter = "all" | OrigineType;
type TnsFilter = "all" | "tns" | "non_tns" | "undecided";
type SortMode = "auto" | "pct_asc" | "pct_desc" | "nom" | "type";

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
  taskKeys,
  optionsByKey,
}: {
  rows: MatriceRow[];
  taskKeys: string[];
  optionsByKey: Record<string, OnboardingStatusOption[]>;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [tnsFilter, setTnsFilter] = useState<TnsFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("auto");

  // Optimistic state : la matrice subit beaucoup d'updates
  // (1 par clic cellule). useOptimistic évite l'attente serveur.
  type Patch =
    | { kind: "task"; clientId: string; taskIdx: number; statut_logique: StatutLogique; statut_detail: string | null }
    | { kind: "tns"; clientId: string; gestion_tns: boolean | null }
    | { kind: "origine"; clientId: string; origine: string | null };

  const [optimisticRows, applyOptimistic] = useOptimistic<MatriceRow[], Patch>(
    rows,
    (state, patch) =>
      state.map((r) => {
        if (r.id !== patch.clientId) return r;
        if (patch.kind === "tns") {
          return { ...r, gestion_tns: patch.gestion_tns };
        }
        if (patch.kind === "origine") {
          return { ...r, origine: patch.origine };
        }
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

  const [, startTransition] = useTransition();

  // IMPORTANT : router.refresh() après chaque action serveur.
  // React `useOptimistic` revient à la valeur prop à la fin de la
  // transition ; sans refresh, on retombe sur l'ancienne donnée. Le refresh
  // déclenche un re-fetch RSC en arrière-plan → la prop se met à jour
  // → la sync optimistic→prop devient invisible.
  function onPickStatus(
    clientId: string,
    taskIdx: number,
    taskId: string,
    libelle: string,
    statut_logique: StatutLogique
  ) {
    startTransition(async () => {
      applyOptimistic({ kind: "task", clientId, taskIdx, statut_logique, statut_detail: libelle });
      await updateOnboardingTaskStatus(taskId, libelle);
      router.refresh();
    });
    setOpenPicker(null);
  }

  function onResetStatus(clientId: string, taskIdx: number, taskId: string) {
    startTransition(async () => {
      applyOptimistic({ kind: "task", clientId, taskIdx, statut_logique: "A_FAIRE", statut_detail: null });
      await updateOnboardingTaskStatus(taskId, null);
      router.refresh();
    });
    setOpenPicker(null);
  }

  function onSetTns(clientId: string, value: boolean | null) {
    startTransition(async () => {
      applyOptimistic({ kind: "tns", clientId, gestion_tns: value });
      await setGestionTns(clientId, value);
      // À l'activation TNS, de nouvelles tâches sont créées côté serveur
      // (previ_tns, affiliation_tns) — le refresh repeuple la matrice.
      router.refresh();
    });
    setOpenTnsPicker(null);
  }

  function onSetOrigineRow(clientId: string, value: string | null) {
    startTransition(async () => {
      applyOptimistic({ kind: "origine", clientId, origine: value });
      await setOrigine(clientId, value);
      // À chaque changement d'origine, les tâches conditionnelles
      // (depot_kbis_banque ou confrere) peuvent être ajoutées : refresh.
      router.refresh();
    });
    setOpenOriginePicker(null);
  }

  // Picker state : 1 popover global (1 ouvert à la fois)
  const [openPicker, setOpenPicker] = useState<{ clientId: string; taskIdx: number } | null>(null);
  const [openTnsPicker, setOpenTnsPicker] = useState<string | null>(null);
  const [openOriginePicker, setOpenOriginePicker] = useState<string | null>(null);

  const annotated = useMemo(
    () => optimisticRows.map((r) => ({ ...r, type: origineToType(r.origine) })),
    [optimisticRows]
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
      return true;
    });
  }, [annotated, search, typeFilter, tnsFilter]);

  // Tri
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const typeOrder: OrigineType[] = ["creation", "reprise", "interne", "soustraitance", "autre"];
    const byPct = (r: MatriceRow) => (r.total > 0 ? r.done / r.total : -1);
    const byName = (a: MatriceRow, b: MatriceRow) =>
      a.denomination.localeCompare(b.denomination, "fr");

    if (sortMode === "nom") {
      arr.sort(byName);
    } else if (sortMode === "pct_asc") {
      arr.sort((a, b) => byPct(a) - byPct(b) || byName(a, b));
    } else if (sortMode === "pct_desc") {
      arr.sort((a, b) => byPct(b) - byPct(a) || byName(a, b));
    } else if (sortMode === "type") {
      arr.sort((a, b) => {
        const ta = typeOrder.indexOf(a.type);
        const tb = typeOrder.indexOf(b.type);
        if (ta !== tb) return ta - tb;
        return byName(a, b);
      });
    } else {
      // auto : Type -> progression croissante -> nom
      arr.sort((a, b) => {
        const ta = typeOrder.indexOf(a.type);
        const tb = typeOrder.indexOf(b.type);
        if (ta !== tb) return ta - tb;
        const pa = byPct(a);
        const pb = byPct(b);
        if (pa !== pb) return pa - pb;
        return byName(a, b);
      });
    }
    return arr;
  }, [filtered, sortMode]);

  // Compteurs par type (sur tout l'ensemble, pour les pills)
  const typeCounts = useMemo(() => {
    const c = { all: annotated.length, creation: 0, reprise: 0, interne: 0, soustraitance: 0, autre: 0 };
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

  // Stats par colonne (taux de complétion d'une tâche sur les dossiers triés/filtrés)
  const colStats = useMemo(() => {
    return taskKeys.map((_, i) => {
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
  }, [sorted, taskKeys]);

  return (
    <div className="space-y-3">
      {/* Toolbar : recherche + filtres */}
      <div className="rounded-lg border bg-card px-3 py-2 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Filtrer par nom ou SIREN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
        <div className="h-6 w-px bg-zinc-200 mx-1" />
        <span className="text-[11px] text-zinc-500">Type :</span>
        <FilterChip label="Tous" active={typeFilter === "all"} count={typeCounts.all} onClick={() => setTypeFilter("all")} />
        <FilterChip label="Création" active={typeFilter === "creation"} count={typeCounts.creation} type="creation" onClick={() => setTypeFilter("creation")} />
        <FilterChip label="Reprise" active={typeFilter === "reprise"} count={typeCounts.reprise} type="reprise" onClick={() => setTypeFilter("reprise")} />
        <FilterChip label="Interne" active={typeFilter === "interne"} count={typeCounts.interne} type="interne" onClick={() => setTypeFilter("interne")} />
        <FilterChip label="ST" active={typeFilter === "soustraitance"} count={typeCounts.soustraitance} type="soustraitance" onClick={() => setTypeFilter("soustraitance")} />
        <div className="h-6 w-px bg-zinc-200 mx-1" />
        <span className="text-[11px] text-zinc-500">TNS :</span>
        <FilterChip label="Tous" active={tnsFilter === "all"} count={tnsCounts.all} onClick={() => setTnsFilter("all")} />
        <FilterChip label="TNS" active={tnsFilter === "tns"} count={tnsCounts.tns} tone="emerald" onClick={() => setTnsFilter("tns")} />
        <FilterChip label="Non TNS" active={tnsFilter === "non_tns"} count={tnsCounts.non_tns} tone="zinc" onClick={() => setTnsFilter("non_tns")} />
        {tnsCounts.undecided > 0 && (
          <FilterChip label="?" active={tnsFilter === "undecided"} count={tnsCounts.undecided} tone="amber" onClick={() => setTnsFilter("undecided")} />
        )}
        <span className="ml-auto text-[11px] text-zinc-500 tabular-nums">
          {sorted.length} dossier{sorted.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Toolbar : tri */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] px-1">
        <span className="text-zinc-500">Tri :</span>
        <SortBtn label="Auto" active={sortMode === "auto"} onClick={() => setSortMode("auto")} />
        <SortBtn label="Progression ↑" active={sortMode === "pct_asc"} onClick={() => setSortMode("pct_asc")} />
        <SortBtn label="Progression ↓" active={sortMode === "pct_desc"} onClick={() => setSortMode("pct_desc")} />
        <SortBtn label="Nom" active={sortMode === "nom"} onClick={() => setSortMode("nom")} />
        <SortBtn label="Type" active={sortMode === "type"} onClick={() => setSortMode("type")} />
        <span className="ml-3 text-[11px] text-zinc-400">
          Astuce : clic sur une pastille pour changer le statut.
        </span>
      </div>

      {/* Tableau */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun dossier ne correspond aux filtres.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              {/* Numéro + label de colonne */}
              <tr className="bg-zinc-50">
                <th
                  className="sticky left-0 z-20 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-700 border-b border-r border-zinc-200"
                  style={{ minWidth: 260 }}
                >
                  Dossier
                </th>
                {taskKeys.map((k, i) => (
                  <th
                    key={k}
                    className="px-1 py-2 text-center text-[10px] font-medium text-zinc-600 border-b border-zinc-200 align-bottom"
                    title={TASK_LONG_LABEL[k] ?? k}
                    style={{ minWidth: 60 }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-zinc-400 tabular-nums">{i + 1}</span>
                      <span className="leading-tight text-[10px] text-zinc-700">
                        {TASK_SHORT_LABEL[k] ?? k}
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
                      {s.total > 0 ? `${s.pct}%` : "—"}
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
                  className={cn(
                    "group/row transition-colors",
                    idx % 2 === 0 ? "bg-white" : "bg-zinc-50/30",
                    "hover:bg-amber-50/40"
                  )}
                >
                  {/* Sticky : client + chips Type + TNS */}
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-2 border-b border-r border-zinc-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/clients/${r.slug}/onboarding`}
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
                        taskKey={taskKeys[i]}
                        options={optionsByKey[taskKeys[i]] ?? []}
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
                        {r.total > 0 ? `${r.done}/${r.total}` : "—"}
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
  options,
  isOpen,
  onOpen,
  onClose,
  onPick,
  onReset,
}: {
  cell: MatriceTaskCell | null;
  taskKey: string;
  options: OnboardingStatusOption[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (libelle: string, statut_logique: StatutLogique) => void;
  onReset: () => void;
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
    const POPOVER_HEIGHT = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
    setPos({
      left: rect.left + rect.width / 2,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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

  return (
    <div className="inline-block" ref={ref}>
      <button
        data-cell-button="1"
        onClick={onOpen}
        className="p-0.5 rounded hover:bg-zinc-100 transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))]"
        title={`${cell.statut_detail ?? statutLabel(cell.statut_logique)} · clic pour modifier`}
      >
        <StatusDot statut={cell.statut_logique} />
      </button>
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
          {/* Titre + statut actuel */}
          <div className="px-3 py-2 border-b">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
              {TASK_LONG_LABEL[taskKey] ?? taskKey}
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
              <div className="px-3 py-2 text-xs text-zinc-500">
                Pas de libellés disponibles pour cette tâche.
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
                      <button
                        key={opt.libelle}
                        onClick={() => onPick(opt.libelle, opt.statut_logique)}
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
          {/* Footer reset */}
          {cell.statut_detail && (
            <div className="border-t bg-zinc-50/50">
              <button
                onClick={onReset}
                className="w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                Réinitialiser
              </button>
            </div>
          )}
        </div>
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
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  // Position fixe (sinon clippé par l'overflow horizontal du tableau)
  useEffect(() => {
    if (!isOpen || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-origine-button]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_HEIGHT = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
    setPos({
      left: rect.left,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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
        className={cn(
          "shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all hover:opacity-80",
          TYPE_PILL[type]
        )}
        title={origine ? `Origine : ${origine} · clic pour modifier` : "Origine non renseignée · clic pour modifier"}
      >
        {TYPE_LABEL[type]}
      </button>
      {isOpen && pos && (
        <div
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
        </div>
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
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);

  // Position fixe (sinon le popover est clippé par l'overflow du tableau)
  useEffect(() => {
    if (!isOpen || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-tns-button]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_HEIGHT = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
    setPos({
      left: rect.left,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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
        className={cn(
          "shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all hover:opacity-80",
          cls
        )}
        title="Caractéristique TNS · clic pour modifier"
      >
        {label}
      </button>
      {isOpen && pos && (
        <div
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
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  StatusDot : pastille statut
// ============================================================================

function StatusDot({ statut }: { statut: StatutLogique | null }) {
  if (statut === null) {
    return <span className="inline-block w-4 h-4 rounded border border-dashed border-zinc-200" />;
  }
  if (statut === "TERMINE") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300">
        <Check className="h-3 w-3 text-emerald-700" strokeWidth={3} />
      </span>
    );
  }
  if (statut === "NON_APPLICABLE") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100 border border-zinc-300">
        <Minus className="h-3 w-3 text-zinc-500" strokeWidth={3} />
      </span>
    );
  }
  if (statut === "EN_COURS") {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 border border-sky-300">
        <span className="inline-block w-2 h-2 bg-sky-600 rounded-[1px]" />
      </span>
    );
  }
  // A_FAIRE
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 border border-rose-200">
      <X className="h-3 w-3 text-rose-400" strokeWidth={2.5} />
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
  tone?: "emerald" | "zinc" | "amber";
  onClick: () => void;
}) {
  const toneClass: Record<"emerald" | "zinc" | "amber", string> = {
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-300",
    zinc: "bg-zinc-100 text-zinc-700 border-zinc-300",
    amber: "bg-amber-50 text-amber-800 border-amber-300",
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
      className={cn(
        "px-2 py-0.5 rounded text-[11px] transition-colors",
        active ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-500 hover:text-zinc-900"
      )}
    >
      {label}
    </button>
  );
}
