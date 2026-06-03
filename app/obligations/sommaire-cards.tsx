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
  /** Nombre d'obligations dont l'echeance est depassee + statut pas terminé. */
  enRetard: number;
  /**
   * Nombre d'obligations dont l'echeance arrive dans les 30 prochains jours
   * OU est deja depassee, ET qui ne sont pas terminees. C'est le nouveau
   * "A traiter" actionnable : ce qui doit etre fait maintenant.
   */
  aTraiter: number;
  derniereAction: string | null;
};

type StatusFilter = "todo" | "done" | "overdue";

/**
 * Dashboard "Suivi de production" - refonte en liste horizontale.
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

  const filtered = useMemo(() => {
    if (statusFilter.size === 0) return rows;
    return rows.filter((r) => {
      // "À traiter" : trackers qui ont des obligations a echeance proche
      if (statusFilter.has("todo") && r.aTraiter > 0) return true;
      // "Terminés" : trackers sans rien a traiter ni en retard
      if (statusFilter.has("done") && r.done > 0 && r.aTraiter === 0 && r.enRetard === 0)
        return true;
      // "En retard" : trackers avec au moins une obligation depassee
      if (statusFilter.has("overdue") && r.enRetard > 0) return true;
      return false;
    });
  }, [rows, statusFilter]);

  const grouped = useMemo(() => {
    return TRACKER_GROUPS.map((g) => ({
      group: g,
      rows: filtered.filter((r) => r.group === g.id),
    })).filter((g) => g.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  // "A traiter" = obligations dont l'echeance arrive bientot (≤ 30j) ou est
  // deja depassee, ET qui ne sont pas terminees. C'est la VRAIE charge de
  // travail actionnable : un dossier dont l'AGO est dans 6 mois n'a pas a
  // se considerer comme "a traiter" maintenant, meme s'il n'est pas fait.
  const totalATraiter = rows.reduce((s, r) => s + r.aTraiter, 0);
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  // Nombre d'obligations en retard (echeance dépassée + statut pas terminé,
  // calcule dans page.tsx via lib/echeances.ts).
  const totalEnRetardTrackers = rows.filter((r) => r.enRetard > 0).length;
  const totalEnRetardObligations = rows.reduce((s, r) => s + r.enRetard, 0);

  // Detail textuel du compteur "A traiter" : liste des trackers contributeurs
  // avec leur poids. Permet de retracer le total meme si un tracker est hors
  // viewport. Ex : "AGO 5 · DAS2 2 · IS soldes 1" pour total = 8.
  const aTraiterBreakdown = rows
    .filter((r) => r.aTraiter > 0)
    .map((r) => `${r.title} : ${r.aTraiter}`)
    .join(" · ");
  const enRetardBreakdown = rows
    .filter((r) => r.enRetard > 0)
    .map((r) => `${r.title} : ${r.enRetard}`)
    .join(" · ");

  return (
    <div className="space-y-6">
      {/* KPI synthétiques : pilules cliquables = filtres rapides.
          Seulement 3 chiffres actionnables :
            - A traiter (échéance ≤ 30j ou dépassée, non terminée)
            - Terminés
            - En retard (déjà dépassées, sous-ensemble de "À traiter") */}
      <div className="flex flex-wrap items-center gap-2">
        <KpiPill
          label="À traiter"
          value={totalATraiter}
          color="rose"
          icon={<CalendarDays className="h-3 w-3" />}
          active={statusFilter.has("todo")}
          onClick={() => toggleStatus("todo")}
          title={
            totalATraiter > 0
              ? `${totalATraiter} obligation${totalATraiter > 1 ? "s" : ""} a echeance proche (≤ 30 jours ou depassee) et non terminee${totalATraiter > 1 ? "s" : ""}\n\nDetail : ${aTraiterBreakdown}`
              : "Rien a traiter dans les 30 prochains jours"
          }
        />
        <KpiPill
          label="Terminés"
          value={totalDone}
          color="emerald"
          active={statusFilter.has("done")}
          onClick={() => toggleStatus("done")}
        />
        <KpiPill
          label="En retard"
          value={totalEnRetardObligations}
          color="rose"
          icon={<CalendarDays className="h-3 w-3" />}
          active={statusFilter.has("overdue")}
          onClick={() => toggleStatus("overdue")}
          title={
            totalEnRetardObligations > 0
              ? `${totalEnRetardObligations} obligation${totalEnRetardObligations > 1 ? "s" : ""} en retard · ${totalEnRetardTrackers} tracker${totalEnRetardTrackers > 1 ? "s" : ""} affecte${totalEnRetardTrackers > 1 ? "s" : ""}\n\nDetail : ${enRetardBreakdown}`
              : "Aucune obligation en retard"
          }
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

      {/* Sections par groupe - chaque groupe = une card distincte avec
          header intégré + liste de trackers. Donne un effet "blocs separes". */}
      {grouped.map(({ group, rows: groupRows }) => {
        // Total a traiter du groupe = somme des aTraiter (echeance proche
        // OU depassee, non terminee). Compteur unique et actionnable, pas de
        // mix de chiffres flous (A faire / En cours / Termine).
        const gATraiter = groupRows.reduce((s, r) => s + r.aTraiter, 0);
        return (
          <section
            key={group.id}
            className="rounded-2xl border border-zinc-200/70 bg-white shadow-card overflow-hidden"
          >
            <header className="flex items-baseline justify-between gap-3 px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/40">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
                {group.label}
              </h2>
              <div
                className={cn(
                  "text-[11px] tabular-nums",
                  gATraiter > 0 ? "text-rose-600 dark:text-rose-400 font-medium" : "text-zinc-400 dark:text-zinc-500",
                )}
                title={`${gATraiter} obligation${gATraiter > 1 ? "s" : ""} a traiter dans les 30 prochains jours (echeance proche ou depassee, non terminee)`}
              >
                {gATraiter > 0 ? `${gATraiter} à traiter` : "rien à traiter"}
              </div>
            </header>

            {/* Liste des rows sans divides : les rows sont separees par
                leur padding vertical seul. Aucune ligne entre. */}
            <div>
              {groupRows.map((r) => (
                <TrackerRow
                  key={r.slug}
                  row={r}
                  urgent={r.aTraiter > 0}
                  onClick={() => router.push(`/obligations/${r.slug}?year=${year}`)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {grouped.length === 0 && (
        <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-10 text-center text-sm text-zinc-500">
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

      {/* Compteur "a traiter" : nb d'obligations DB dont l'echeance arrive
          dans les 30 prochains jours OU est deja depassee, ET non terminees.
          Donne directement la charge de travail actionnable sur ce tracker.
          Masque si 0 -> l'oeil va aux trackers qui demandent action. */}
      <div className="shrink-0 tabular-nums text-[11px] min-w-[80px] text-right">
        {row.aTraiter > 0 ? (
          <span
            className={cn(
              "font-semibold",
              row.enRetard > 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-700 dark:text-amber-400",
            )}
            title={
              row.enRetard > 0
                ? `${row.aTraiter} a traiter · dont ${row.enRetard} deja en retard`
                : `${row.aTraiter} a traiter (echeance dans ≤ 30j)`
            }
          >
            {row.aTraiter} à traiter
          </span>
        ) : (
          <span className="text-zinc-300 dark:text-zinc-600" title="Rien a traiter dans les 30 prochains jours">
            -
          </span>
        )}
      </div>

      {/* Prochaine echeance : date informative (la plus proche non terminee) */}
      <div
        className={cn(
          "hidden md:flex items-center gap-1.5 shrink-0 text-[11px] tabular-nums w-28 justify-end",
          row.enRetard > 0
            ? "text-rose-700 dark:text-rose-400 font-semibold"
            : urgent
            ? "text-amber-700 dark:text-amber-400 font-medium"
            : "text-zinc-500 dark:text-zinc-400",
        )}
        title={
          row.prochaineEcheance
            ? `Prochaine echeance non terminee : ${fmtDateFr(row.prochaineEcheance)}`
            : "Aucune echeance a venir sur ce tracker"
        }
      >
        {row.prochaineEcheance ? (
          <>
            <CalendarDays className={cn("h-3 w-3", row.enRetard > 0 ? "text-rose-500" : urgent ? "text-amber-500" : "text-zinc-400")} aria-hidden="true" />
            <span>{fmtDateFr(row.prochaineEcheance)}</span>
          </>
        ) : (
          <span className="text-zinc-300 dark:text-zinc-600">-</span>
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
//  KpiPill : KPI synthétique cliquable (= filtre)
// ============================================================================

function KpiPill({
  label,
  value,
  color,
  icon,
  active,
  onClick,
  title,
}: {
  label: string;
  value: number;
  color: "rose" | "amber" | "emerald";
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title?: string;
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
      title={title}
      className={cn(
        "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all shadow-card",
        active
          ? `${p.bgActive} text-zinc-900 border-transparent ring-2 shadow-card-hover`
          : "bg-white text-zinc-700 border-zinc-200/70 hover:border-zinc-300 hover:shadow-card-hover hover:-translate-y-px"
      )}
    >
      {icon ? (
        <span className={cn(active ? "text-zinc-700" : "text-zinc-400")}>{icon}</span>
      ) : (
        <span className={cn("inline-block w-2 h-2 rounded-full", p.dot)} aria-hidden />
      )}
      <span className="uppercase tracking-[0.06em] text-[10px]">{label}</span>
      <span className="tabular-nums font-semibold text-sm">{value}</span>
    </button>
  );
}

