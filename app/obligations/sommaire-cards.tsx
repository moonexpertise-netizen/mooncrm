"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { cn, fmtDateFr } from "@/lib/utils";
import { TRACKER_GROUPS, type TrackerGroup } from "./trackers";

export type TrackerStat = {
  slug: string;
  title: string;
  description?: string;
  group: TrackerGroup;
  todo: number;
  wip: number;
  done: number;
  total: number;
  prochaineEcheance: string | null;
  derniereAction: string | null;
};

type StatusFilter = "todo" | "wip" | "done" | "urgent";

/**
 * Dashboard "Suivi de production" — refonte en liste horizontale.
 *
 * Philosophy : 1 ligne par tracker, scan rapide, info critique (échéance)
 * mise en valeur. KPI synthétiques en top sous forme de pilules cliquables
 * (filtres). Groupes (TVA / IS / Annuelles / Autres) comme sections claires.
 *
 * Code couleur des compteurs : seuls les chiffres > 0 sont colorés
 * (rouge / ambre / vert), les zéros sont en gris discret → l'œil va
 * directement vers ce qui demande action.
 */
export default function SommaireCards({
  rows,
  year,
}: {
  rows: TrackerStat[];
  year: number;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<Set<StatusFilter>>(new Set());

  function toggleStatus(s: StatusFilter) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // Cutoff "échéance urgente" = dans les 30 prochains jours
  const URGENT_DAYS = 30;
  const urgentCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + URGENT_DAYS);
    return d.toISOString().substring(0, 10);
  }, []);
  const today = useMemo(() => new Date().toISOString().substring(0, 10), []);

  function isUrgent(r: TrackerStat): boolean {
    if (!r.prochaineEcheance) return false;
    return r.prochaineEcheance >= today && r.prochaineEcheance <= urgentCutoff;
  }

  const filtered = useMemo(() => {
    if (statusFilter.size === 0) return rows;
    return rows.filter((r) => {
      if (statusFilter.has("todo") && r.todo > 0) return true;
      if (statusFilter.has("wip") && r.wip > 0) return true;
      if (statusFilter.has("done") && r.done > 0 && r.todo === 0 && r.wip === 0)
        return true;
      if (statusFilter.has("urgent") && isUrgent(r)) return true;
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, statusFilter, today, urgentCutoff]);

  const grouped = useMemo(() => {
    return TRACKER_GROUPS.map((g) => ({
      group: g,
      rows: filtered.filter((r) => r.group === g.id),
    })).filter((g) => g.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const totalTodo = rows.reduce((s, r) => s + r.todo, 0);
  const totalWip = rows.reduce((s, r) => s + r.wip, 0);
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  const totalUrgent = rows.filter(isUrgent).length;

  return (
    <div className="space-y-6">
      {/* KPI synthétiques : pilules cliquables = filtres rapides. */}
      <div className="flex flex-wrap items-center gap-2">
        <KpiPill
          label="À traiter"
          value={totalTodo}
          color="rose"
          active={statusFilter.has("todo")}
          onClick={() => toggleStatus("todo")}
        />
        <KpiPill
          label="En cours"
          value={totalWip}
          color="amber"
          active={statusFilter.has("wip")}
          onClick={() => toggleStatus("wip")}
        />
        <KpiPill
          label="Terminés"
          value={totalDone}
          color="emerald"
          active={statusFilter.has("done")}
          onClick={() => toggleStatus("done")}
        />
        <KpiPill
          label={`Urgent · ${URGENT_DAYS}j`}
          value={totalUrgent}
          color="amber"
          icon={<CalendarDays className="h-3 w-3" />}
          active={statusFilter.has("urgent")}
          onClick={() => toggleStatus("urgent")}
        />
        {statusFilter.size > 0 && (
          <button
            onClick={() => setStatusFilter(new Set())}
            className="text-xs text-zinc-500 hover:text-zinc-900 underline underline-offset-2 ml-1"
          >
            Tout afficher
          </button>
        )}
      </div>

      {/* Sections par groupe — chaque section = liste de rows horizontales */}
      {grouped.map(({ group, rows: groupRows }) => {
        const gTodo = groupRows.reduce((s, r) => s + r.todo, 0);
        const gWip = groupRows.reduce((s, r) => s + r.wip, 0);
        const gDone = groupRows.reduce((s, r) => s + r.done, 0);
        return (
          <section key={group.id} className="space-y-2">
            {/* En-tête de groupe : titre + récap inline */}
            <header className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                {group.label}
              </h2>
              <div className="text-[11px] text-zinc-400 tabular-nums">
                <span className={cn(gTodo > 0 && "text-rose-600 font-medium")}>
                  {gTodo}
                </span>
                <span className="mx-1">·</span>
                <span className={cn(gWip > 0 && "text-amber-600 font-medium")}>
                  {gWip}
                </span>
                <span className="mx-1">·</span>
                <span className={cn(gDone > 0 && "text-emerald-600 font-medium")}>
                  {gDone}
                </span>
              </div>
            </header>

            {/* Liste des rows */}
            <div className="rounded-lg border border-zinc-200 bg-card divide-y divide-zinc-100 overflow-hidden">
              {groupRows.map((r) => (
                <TrackerRow
                  key={r.slug}
                  row={r}
                  urgent={isUrgent(r)}
                  onClick={() => router.push(`/obligations/${r.slug}?year=${year}`)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {grouped.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun tracker ne correspond aux filtres.
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  Row : 1 ligne horizontale par tracker
// ============================================================================

function TrackerRow({
  row,
  urgent,
  onClick,
}: {
  row: TrackerStat;
  urgent: boolean;
  onClick: () => void;
}) {
  const empty = row.total === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      className={cn(
        "group/row w-full flex items-center gap-3 px-3 py-2.5 text-left",
        "hover:bg-zinc-50 active:bg-zinc-100 transition-colors",
        empty && "opacity-50 cursor-default"
      )}
    >
      {/* Nom + description courte. Tronqué sur petite largeur. */}
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-900 truncate">
            {row.title}
          </div>
          {row.description && (
            <div className="text-[11px] text-zinc-500 truncate hidden md:block">
              {row.description}
            </div>
          )}
        </div>
      </div>

      {/* 3 compteurs alignés verticalement, largeur fixe. Le 0 est en gris
          discret → l'œil se concentre sur ce qui n'est pas zéro. */}
      <div className="hidden sm:flex items-center gap-1 shrink-0 tabular-nums">
        <Counter value={row.todo} color="rose" />
        <Counter value={row.wip} color="amber" />
        <Counter value={row.done} color="emerald" />
      </div>

      {/* Sur mobile : compteurs compactés en une ligne */}
      <div className="sm:hidden flex items-center gap-1.5 shrink-0 text-[11px] tabular-nums">
        <span className={cn(row.todo > 0 ? "text-rose-600 font-semibold" : "text-zinc-300")}>
          {row.todo}
        </span>
        <span className="text-zinc-300">/</span>
        <span className={cn(row.wip > 0 ? "text-amber-600 font-semibold" : "text-zinc-300")}>
          {row.wip}
        </span>
        <span className="text-zinc-300">/</span>
        <span className={cn(row.done > 0 ? "text-emerald-600 font-semibold" : "text-zinc-300")}>
          {row.done}
        </span>
      </div>

      {/* Échéance : info la plus critique pour le pilotage.
          Mise en valeur si elle approche (urgent = dans 30j). */}
      <div
        className={cn(
          "hidden md:flex items-center gap-1.5 shrink-0 text-[11px] tabular-nums w-28 justify-end",
          urgent ? "text-amber-700 font-medium" : "text-zinc-500"
        )}
      >
        {row.prochaineEcheance ? (
          <>
            <CalendarDays className={cn("h-3 w-3", urgent ? "text-amber-500" : "text-zinc-400")} />
            <span>{fmtDateFr(row.prochaineEcheance)}</span>
          </>
        ) : (
          <span className="text-zinc-300">·</span>
        )}
      </div>

      {/* Flèche à droite : affordance "cliquable" */}
      <ArrowRight
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-transform",
          empty ? "text-zinc-200" : "text-zinc-300 group-hover/row:text-[hsl(var(--gold))] group-hover/row:translate-x-0.5"
        )}
      />
    </button>
  );
}

// ============================================================================
//  Counter : pastille compacte d'un statut. Gris si 0, coloré sinon.
// ============================================================================

function Counter({ value, color }: { value: number; color: "rose" | "amber" | "emerald" }) {
  const muted = value === 0;
  const palette = {
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  } as const;
  return (
    <div
      className={cn(
        "min-w-[36px] px-1.5 py-1 rounded text-[11px] font-semibold text-center tabular-nums ring-1",
        muted
          ? "bg-zinc-50 text-zinc-300 ring-zinc-100"
          : palette[color]
      )}
    >
      {value}
    </div>
  );
}

// ============================================================================
//  KpiPill : KPI synthétique cliquable (= filtre)
// ============================================================================

function KpiPill({
  label,
  value,
  color,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: "rose" | "amber" | "emerald";
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const palette: Record<typeof color, { dot: string; bgActive: string }> = {
    rose: { dot: "bg-rose-500", bgActive: "bg-rose-50 ring-rose-200" },
    amber: { dot: "bg-amber-500", bgActive: "bg-amber-50 ring-amber-200" },
    emerald: { dot: "bg-emerald-500", bgActive: "bg-emerald-50 ring-emerald-200" },
  };
  const p = palette[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
        active
          ? `${p.bgActive} text-zinc-900 border-transparent ring-2 shadow-sm`
          : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900"
      )}
    >
      {icon ? (
        <span className={cn(active ? "text-zinc-700" : "text-zinc-400")}>{icon}</span>
      ) : (
        <span className={cn("inline-block w-2 h-2 rounded-full", p.dot)} aria-hidden />
      )}
      <span className="uppercase tracking-wide text-[10px]">{label}</span>
      <span className="tabular-nums font-semibold text-sm">{value}</span>
    </button>
  );
}
