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
  done: number;
  total: number;
  pct: number;
};

type Filter = "all" | "in_progress" | "complete" | "not_started" | "no_tasks";
type TypeFilter = "all" | "creation" | "reprise" | "interne" | "soustraitance" | "autre";

/** Type métier dérivé de l'origine (utilisé pour le suivi transverse).
 *
 *   1 - Création          → "creation"
 *   2 - Reprise           → "reprise"
 *   3 - Reprise sans EC   → "reprise"
 *   4 - Interne           → "interne"
 *   5 - Sous-traitance    → "soustraitance"
 *   (null / legacy)       → "autre"
 */
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

/**
 * Liste compacte des onboardings.
 *  - Bandeau transverse en haut : agrégats par Type (Création / Reprise / Sous-traitance)
 *  - Filtres statut : tous / en cours / terminés / pas commencés / sans tâches
 *  - Filtre Type : tous / Création / Reprise / Sous-traitance
 *  - Recherche par nom ou SIREN
 *  - Tri par nom ou par % progression
 *  - 1 ligne par client : Type chip + nom + barre de progression + compteur
 */
export default function OnboardingList({ rows }: { rows: OnboardingRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<"nom" | "pct">("pct");

  // Annotate rows with derived Type once
  const annotated = useMemo(
    () => rows.map((r) => ({ ...r, type: origineToType(r.origine) })),
    [rows]
  );

  // Agrégat transverse par Type (utilisé pour le bandeau du haut)
  const byType = useMemo(() => {
    const acc: Record<
      OrigineType,
      { count: number; done: number; total: number }
    > = {
      creation: { count: 0, done: 0, total: 0 },
      reprise: { count: 0, done: 0, total: 0 },
      interne: { count: 0, done: 0, total: 0 },
      soustraitance: { count: 0, done: 0, total: 0 },
      autre: { count: 0, done: 0, total: 0 },
    };
    for (const r of annotated) {
      const t = acc[r.type];
      t.count++;
      t.done += r.done;
      t.total += r.total;
    }
    return acc;
  }, [annotated]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return annotated.filter((r) => {
      if (s) {
        const hay = `${r.denomination} ${r.siren ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (filter === "all") return true;
      if (filter === "no_tasks") return r.total === 0;
      if (filter === "complete") return r.total > 0 && r.done === r.total;
      if (filter === "in_progress") return r.done > 0 && r.done < r.total;
      if (filter === "not_started") return r.total > 0 && r.done === 0;
      return true;
    });
  }, [annotated, search, filter, typeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "pct") {
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

  // Compteurs statut (sur l'ensemble filtré par type, pour cohérence visuelle)
  const counts = useMemo(() => {
    const c = {
      all: 0,
      in_progress: 0,
      complete: 0,
      not_started: 0,
      no_tasks: 0,
    };
    for (const r of annotated) {
      if (typeFilter !== "all" && r.type !== typeFilter) continue;
      c.all++;
      if (r.total === 0) c.no_tasks++;
      else if (r.done === r.total) c.complete++;
      else if (r.done === 0) c.not_started++;
      else c.in_progress++;
    }
    return c;
  }, [annotated, typeFilter]);

  // Compteurs par type (pour les pills Type)
  const typeCounts = {
    all: annotated.length,
    creation: byType.creation.count,
    reprise: byType.reprise.count,
    interne: byType.interne.count,
    soustraitance: byType.soustraitance.count,
    autre: byType.autre.count,
  };

  return (
    <div className="space-y-4">
      {/* Bandeau transverse : agrégat par Type */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TypeSummaryCard
          type="creation"
          stats={byType.creation}
          active={typeFilter === "creation"}
          onClick={() =>
            setTypeFilter((prev) => (prev === "creation" ? "all" : "creation"))
          }
        />
        <TypeSummaryCard
          type="reprise"
          stats={byType.reprise}
          active={typeFilter === "reprise"}
          onClick={() =>
            setTypeFilter((prev) => (prev === "reprise" ? "all" : "reprise"))
          }
        />
        <TypeSummaryCard
          type="interne"
          stats={byType.interne}
          active={typeFilter === "interne"}
          onClick={() =>
            setTypeFilter((prev) => (prev === "interne" ? "all" : "interne"))
          }
        />
        <TypeSummaryCard
          type="soustraitance"
          stats={byType.soustraitance}
          active={typeFilter === "soustraitance"}
          onClick={() =>
            setTypeFilter((prev) =>
              prev === "soustraitance" ? "all" : "soustraitance"
            )
          }
        />
      </div>

      {/* Toolbar */}
      <div className="rounded-lg border bg-card px-3 py-2 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Filtrer par nom ou SIREN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-2.5 py-1.5 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
        <div className="h-6 w-px bg-zinc-200 mx-1" />
        <FilterPill label="Tous" value="all" current={filter} count={counts.all} onClick={() => setFilter("all")} />
        <FilterPill label="En cours" value="in_progress" current={filter} count={counts.in_progress} color="amber" onClick={() => setFilter("in_progress")} />
        <FilterPill label="Pas commencé" value="not_started" current={filter} count={counts.not_started} color="rose" onClick={() => setFilter("not_started")} />
        <FilterPill label="Terminé" value="complete" current={filter} count={counts.complete} color="emerald" onClick={() => setFilter("complete")} />
        <FilterPill label="Sans tâches" value="no_tasks" current={filter} count={counts.no_tasks} color="gray" onClick={() => setFilter("no_tasks")} />
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-zinc-500">Tri :</span>
          <button
            onClick={() => setSort("pct")}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] transition-colors",
              sort === "pct" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            Progression
          </button>
          <button
            onClick={() => setSort("nom")}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] transition-colors",
              sort === "nom" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            Nom
          </button>
        </div>
      </div>

      {/* Pills Type (filtre transverse) */}
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="text-zinc-500">Type :</span>
        <TypePill label="Tous" value="all" current={typeFilter} count={typeCounts.all} onClick={() => setTypeFilter("all")} />
        <TypePill label="Création" value="creation" current={typeFilter} count={typeCounts.creation} type="creation" onClick={() => setTypeFilter("creation")} />
        <TypePill label="Reprise" value="reprise" current={typeFilter} count={typeCounts.reprise} type="reprise" onClick={() => setTypeFilter("reprise")} />
        <TypePill label="Interne" value="interne" current={typeFilter} count={typeCounts.interne} type="interne" onClick={() => setTypeFilter("interne")} />
        <TypePill label="Sous-traitance" value="soustraitance" current={typeFilter} count={typeCounts.soustraitance} type="soustraitance" onClick={() => setTypeFilter("soustraitance")} />
        {typeCounts.autre > 0 && (
          <TypePill label="Autre" value="autre" current={typeFilter} count={typeCounts.autre} type="autre" onClick={() => setTypeFilter("autre")} />
        )}
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
//  TypeSummaryCard : agrégat par Type (cliquable = filtre)
// ============================================================================

function TypeSummaryCard({
  type,
  stats,
  active,
  onClick,
}: {
  type: OrigineType;
  stats: { count: number; done: number; total: number };
  active: boolean;
  onClick: () => void;
}) {
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  // Si pas de dossiers de ce type, on grise la carte mais reste cliquable
  // (utile si Benjamin veut quand même appliquer le filtre vide).
  const empty = stats.count === 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card p-3 text-left transition-all hover:shadow-sm active:scale-[0.99]",
        active
          ? "border-[hsl(var(--gold))] ring-2 ring-[hsl(var(--gold))]/30"
          : "border-zinc-200 hover:border-zinc-300",
        empty && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={cn(
            "inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border",
            TYPE_PILL[type]
          )}
        >
          {TYPE_LABEL[type]}
        </span>
        <span className="text-[11px] text-zinc-500 tabular-nums">
          {stats.count} dossier{stats.count > 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-zinc-800 tabular-nums">
          {stats.done} / {stats.total} tâches
        </span>
        <span className="text-xs text-zinc-500 tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            pct >= 100 ? "bg-emerald-500" : "bg-[hsl(var(--gold))]"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
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
//  Pills réutilisables
// ============================================================================

function FilterPill({
  label,
  value,
  current,
  count,
  color = "gray",
  onClick,
}: {
  label: string;
  value: Filter;
  current: Filter;
  count: number;
  color?: "amber" | "emerald" | "rose" | "gray";
  onClick: () => void;
}) {
  const palette = {
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-300",
    rose: "bg-rose-50 text-rose-800 border-rose-300",
    gray: "bg-zinc-100 text-zinc-700 border-zinc-300",
  } as const;
  const active = value === current;
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 active:scale-95 inline-flex items-center gap-1.5",
        active ? `${palette[color]} shadow-sm` : "bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "" : "text-zinc-400")}>{count}</span>
    </button>
  );
}

function TypePill({
  label,
  value,
  current,
  count,
  type,
  onClick,
}: {
  label: string;
  value: TypeFilter;
  current: TypeFilter;
  count: number;
  type?: OrigineType;
  onClick: () => void;
}) {
  const active = value === current;
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 active:scale-95 inline-flex items-center gap-1.5",
        active && type ? `${TYPE_PILL[type]} shadow-sm` : active ? "bg-zinc-100 text-zinc-700 border-zinc-300 shadow-sm" : "bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "" : "text-zinc-400")}>{count}</span>
    </button>
  );
}
