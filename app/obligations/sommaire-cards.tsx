"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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

type StatusFilter = "todo" | "wip" | "done";

export default function SommaireCards({
  rows,
  year,
}: {
  rows: TrackerStat[];
  year: number;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<Set<StatusFilter>>(
    new Set(),
  );

  function toggleStatus(s: StatusFilter) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = useMemo(() => {
    if (statusFilter.size === 0) return rows;
    return rows.filter((r) => {
      if (statusFilter.has("todo") && r.todo > 0) return true;
      if (statusFilter.has("wip") && r.wip > 0) return true;
      if (statusFilter.has("done") && r.done > 0 && r.todo === 0 && r.wip === 0)
        return true;
      return false;
    });
  }, [rows, statusFilter]);

  const grouped = useMemo(() => {
    return TRACKER_GROUPS.map((g) => ({
      group: g,
      rows: filtered.filter((r) => r.group === g.id),
    })).filter((g) => g.rows.length > 0);
  }, [filtered]);

  const totalTodo = rows.reduce((s, r) => s + r.todo, 0);
  const totalWip = rows.reduce((s, r) => s + r.wip, 0);
  const totalDone = rows.reduce((s, r) => s + r.done, 0);

  return (
    <div className="space-y-6">
      {/* Voyants globaux + filtres */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FilterCard
          label="À traiter"
          color="rose"
          value={totalTodo}
          active={statusFilter.has("todo")}
          onClick={() => toggleStatus("todo")}
        />
        <FilterCard
          label="En cours"
          color="amber"
          value={totalWip}
          active={statusFilter.has("wip")}
          onClick={() => toggleStatus("wip")}
        />
        <FilterCard
          label="Terminés"
          color="emerald"
          value={totalDone}
          active={statusFilter.has("done")}
          onClick={() => toggleStatus("done")}
        />
      </div>

      {/* Cartes regroupées par sous-bloc */}
      {grouped.map(({ group, rows: groupRows }) => {
        const gTodo = groupRows.reduce((s, r) => s + r.todo, 0);
        const gWip = groupRows.reduce((s, r) => s + r.wip, 0);
        const gDone = groupRows.reduce((s, r) => s + r.done, 0);
        return (
          <section key={group.id} className="space-y-3">
            <div className="flex items-baseline gap-3 border-b border-zinc-200 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">
                {group.label}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {groupRows.length} tracker{groupRows.length > 1 ? "s" : ""} ·{" "}
                {gTodo} à traiter · {gWip} en cours · {gDone} terminés
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {groupRows.map((r) => (
                <TrackerCard
                  key={r.slug}
                  row={r}
                  year={year}
                  onClick={() =>
                    router.push(
                      `/obligations/suivi?type=${r.slug}&year=${year}`,
                    )
                  }
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

function TrackerCard({
  row,
  onClick,
}: {
  row: TrackerStat;
  year: number;
  onClick: () => void;
}) {
  const empty = row.total === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group text-left rounded-lg border bg-card p-4 hover:border-[hsl(var(--gold))]/60 hover:shadow-sm transition-all flex flex-col gap-3",
        empty && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-zinc-900 truncate">{row.title}</div>
          {row.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {row.description}
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 mt-0.5">
          {row.total}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Voyant label="À traiter" value={row.todo} color="rose" />
        <Voyant label="En cours" value={row.wip} color="amber" />
        <Voyant label="Terminés" value={row.done} color="emerald" />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-zinc-100">
        <span>
          {row.prochaineEcheance ? (
            <>
              Prochaine{" "}
              <span className="text-zinc-700 tabular-nums">
                {fmtDateFr(row.prochaineEcheance)}
              </span>
            </>
          ) : (
            <span className="text-zinc-300">·</span>
          )}
        </span>
        <span>
          {row.derniereAction ? (
            <>
              Maj{" "}
              <span className="text-zinc-700 tabular-nums">
                {fmtDateFr(row.derniereAction)}
              </span>
            </>
          ) : (
            <span className="text-zinc-300">·</span>
          )}
        </span>
      </div>
    </button>
  );
}

function Voyant({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "rose" | "amber" | "emerald";
}) {
  const palette: Record<typeof color, { dot: string; bg: string; text: string }> = {
    rose: { dot: "bg-rose-500", bg: "bg-rose-50", text: "text-rose-700" },
    amber: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
    emerald: {
      dot: "bg-emerald-500",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
  };
  const p = palette[color];
  const muted = value === 0;
  return (
    <div
      className={cn(
        "rounded-md px-2 py-1.5 flex items-center justify-between gap-1.5",
        muted ? "bg-zinc-50 text-zinc-400" : `${p.bg} ${p.text}`,
      )}
    >
      <span className="text-[10px] uppercase tracking-wide font-medium truncate">
        {label}
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums font-semibold">
        <span
          className={cn("inline-block w-1.5 h-1.5 rounded-full", muted ? "bg-zinc-300" : p.dot)}
        />
        {value}
      </span>
    </div>
  );
}

function FilterCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: "rose" | "amber" | "emerald";
  active: boolean;
  onClick: () => void;
}) {
  const palette: Record<typeof color, string> = {
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-all flex items-center justify-between gap-3",
        active
          ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
          : "bg-card hover:border-zinc-400",
      )}
    >
      <div>
        <div className={cn("text-xs uppercase tracking-wider", active ? "text-zinc-300" : "text-muted-foreground")}>
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      </div>
      <span className={cn("inline-block w-3 h-3 rounded-full", palette[color])} />
    </button>
  );
}
