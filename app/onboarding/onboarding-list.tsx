"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type OnboardingRow = {
  id: string;
  slug: string;
  denomination: string;
  siren: string | null;
  pipeline_statut: string | null;
  origine: string | null;
  gestion_tns: boolean | null;
  done: number;
  total: number;
  pct: number;
};

type TypeFilter = "all" | OrigineType;
type TnsFilter = "all" | "tns" | "non_tns" | "undecided";
type StatusFilter = "all" | "in_progress" | "not_started" | "complete";
type SortMode = "pct" | "nom";

/** Type métier dérivé de l'origine (cohérent avec la matrice). */
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

/**
 * Liste compacte des onboardings (vue Liste de /onboarding).
 *
 * Toolbar unifiée avec la matrice : search · Type · TNS · Tri (à droite) · count.
 * Pas de filtres statut séparés (la barre de progression visuelle suffit ;
 * un tri "Progression ↑" met automatiquement les dossiers à finir en haut).
 */
export default function OnboardingList({ rows }: { rows: OnboardingRow[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [tnsFilter, setTnsFilter] = useState<TnsFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("pct");

  // Annotate rows with derived Type once
  const annotated = useMemo(
    () => rows.map((r) => ({ ...r, type: origineToType(r.origine) })),
    [rows]
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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "pct") {
      // Tri : en cours / pas commencés en haut (pct croissant), terminés en bas,
      // dossiers sans tâches tout à la fin.
      arr.sort((a, b) => {
        if (a.total === 0 && b.total === 0) return a.denomination.localeCompare(b.denomination, "fr");
        if (a.total === 0) return 1;
        if (b.total === 0) return -1;
        return a.pct - b.pct;
      });
    } else {
      arr.sort((a, b) => a.denomination.localeCompare(b.denomination, "fr"));
    }
    return arr;
  }, [filtered, sort]);

  // Compteurs par type / TNS pour les pills
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

  return (
    <div className="space-y-4">
      {/* Toolbar unifiée (mêmes filtres et tri que la matrice) */}
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
        <FilterChip label="Reprise avec EC" active={typeFilter === "reprise_ec"} count={typeCounts.reprise_ec} type="reprise_ec" onClick={() => setTypeFilter("reprise_ec")} />
        <FilterChip label="Reprise sans EC" active={typeFilter === "reprise_sans_ec"} count={typeCounts.reprise_sans_ec} type="reprise_sans_ec" onClick={() => setTypeFilter("reprise_sans_ec")} />
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
        <div className="h-6 w-px bg-zinc-200 mx-1" />
        <span className="text-[11px] text-zinc-500">Statut :</span>
        <FilterChip label="Tous" active={statusFilter === "all"} count={statusCounts.all} onClick={() => setStatusFilter("all")} />
        <FilterChip label="En cours" active={statusFilter === "in_progress"} count={statusCounts.in_progress} tone="amber" onClick={() => setStatusFilter("in_progress")} />
        <FilterChip label="Pas commencé" active={statusFilter === "not_started"} count={statusCounts.not_started} tone="rose" onClick={() => setStatusFilter("not_started")} />
        <FilterChip label="Terminé" active={statusFilter === "complete"} count={statusCounts.complete} tone="emerald" onClick={() => setStatusFilter("complete")} />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">Tri :</span>
          <SortBtn label="Progression" active={sort === "pct"} onClick={() => setSort("pct")} />
          <SortBtn label="Nom" active={sort === "nom"} onClick={() => setSort("nom")} />
          <span className="text-[11px] text-zinc-500 tabular-nums ml-2">
            {sorted.length} dossier{sorted.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Liste */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun dossier ne correspond aux filtres.
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y divide-zinc-100 overflow-hidden">
          {sorted.map((r) => (
            <OnboardingRowComp key={r.id} row={r} type={r.type} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  OnboardingRowComp : ligne d'un dossier (avec chip Type)
// ============================================================================

function OnboardingRowComp({ row, type }: { row: OnboardingRow; type: OrigineType }) {
  const isComplete = row.total > 0 && row.done === row.total;
  const noTasks = row.total === 0;
  return (
    <Link
      href={`/clients/${row.slug}/onboarding`}
      className="group/row flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
    >
      <div className="shrink-0">
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Circle className={cn("h-4 w-4", noTasks ? "text-zinc-300" : "text-zinc-400")} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-900 truncate">{row.denomination}</span>
          <span
            className={cn(
              "shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border",
              TYPE_PILL[type]
            )}
          >
            {TYPE_LABEL[type]}
          </span>
          {row.siren && (
            <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">{row.siren}</span>
          )}
        </div>
        {/* Barre de progression sous le nom */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                noTasks
                  ? "bg-zinc-200"
                  : isComplete
                  ? "bg-emerald-500"
                  : "bg-[hsl(var(--gold))]"
              )}
              style={{ width: `${noTasks ? 0 : row.pct}%` }}
            />
          </div>
          <span
            className={cn(
              "text-[11px] tabular-nums shrink-0 min-w-[60px] text-right",
              noTasks
                ? "text-zinc-400"
                : isComplete
                ? "text-emerald-700"
                : "text-zinc-700"
            )}
          >
            {noTasks ? "—" : `${row.done}/${row.total}`}
            <span className="text-zinc-400 ml-1">
              {noTasks ? "" : `(${row.pct}%)`}
            </span>
          </span>
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover/row:text-[hsl(var(--gold))] group-hover/row:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

// ============================================================================
//  FilterChip + SortBtn (mêmes composants que dans matrice-table)
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
      className={cn(
        "px-2 py-0.5 rounded text-[11px] transition-colors",
        active ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-500 hover:text-zinc-900"
      )}
    >
      {label}
    </button>
  );
}
