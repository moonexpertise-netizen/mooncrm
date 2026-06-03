"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  derniereAction: string | null;
};

type StatusFilter = "todo" | "wip" | "done" | "urgent" | "overdue";

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
type Charge = {
  enRetard: number;
  cetteSemaine: number;
  ceMois: number;
  moisProchain: number;
  deuxMois: number;
  plusTard: number;
};

export default function SommaireCards({
  rows,
  year,
  charge,
}: {
  rows: TrackerStat[];
  year: number;
  charge?: Charge;
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
      if (statusFilter.has("overdue") && r.enRetard > 0) return true;
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

  // Une tache tant qu'elle n'est pas TERMINE reste a traiter (logique metier :
  // une obligation EN_COURS n'est pas "deja faite", elle reste dangereuse vis-a-vis
  // de l'echeance). On regroupe donc A_FAIRE + EN_COURS dans le compteur principal
  // "A traiter". Garde wip separe en complement informatif.
  const totalTodoPur = rows.reduce((s, r) => s + r.todo, 0);
  const totalWip = rows.reduce((s, r) => s + r.wip, 0);
  const totalATraiter = totalTodoPur + totalWip;
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  const totalUrgent = rows.filter(isUrgent).length;
  // Nombre de trackers avec au moins une obligation en retard (echeance dépassée
  // + statut pas terminé, calcule dans page.tsx via lib/echeances.ts).
  const totalEnRetardTrackers = rows.filter((r) => r.enRetard > 0).length;
  const totalEnRetardObligations = rows.reduce((s, r) => s + r.enRetard, 0);

  return (
    <div className="space-y-6">
      {/* Charge a venir : bande visuelle qui montre la vague d'echeances
          qui arrive. Cliquable -> page /obligations/echeances filtree. */}
      {charge && (
        <ChargeAVenir charge={charge} />
      )}

      {/* KPI synthétiques : pilules cliquables = filtres rapides. */}
      <div className="flex flex-wrap items-center gap-2">
        <KpiPill
          label="À traiter"
          value={totalATraiter}
          color="rose"
          active={statusFilter.has("todo") || statusFilter.has("wip")}
          onClick={() => toggleStatus("todo")}
          title={`${totalATraiter} obligation${totalATraiter > 1 ? "s" : ""} non terminée${totalATraiter > 1 ? "s" : ""} (${totalTodoPur} À faire + ${totalWip} En cours)`}
        />
        <KpiPill
          label="dont En cours"
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
        <KpiPill
          label="En retard"
          value={totalEnRetardObligations}
          color="rose"
          icon={<CalendarDays className="h-3 w-3" />}
          active={statusFilter.has("overdue")}
          onClick={() => toggleStatus("overdue")}
          title={`${totalEnRetardObligations} obligation${totalEnRetardObligations > 1 ? "s" : ""} en retard · ${totalEnRetardTrackers} tracker${totalEnRetardTrackers > 1 ? "s" : ""} affecté${totalEnRetardTrackers > 1 ? "s" : ""}`}
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
        const gTodo = groupRows.reduce((s, r) => s + r.todo, 0);
        const gWip = groupRows.reduce((s, r) => s + r.wip, 0);
        const gDone = groupRows.reduce((s, r) => s + r.done, 0);
        return (
          <section
            key={group.id}
            className="rounded-2xl border border-zinc-200/70 bg-white shadow-card overflow-hidden"
          >
            {/* Header integre + ligne de legende dessous : titre du groupe a
                gauche, et 3 mini-pastilles A faire / En cours / Termine pour
                expliciter l'ordre des compteurs ci-dessous. */}
            <header className="flex flex-col gap-2 px-4 py-2.5 border-b border-zinc-100 bg-zinc-50/40">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
                  {group.label}
                </h2>
                <div
                  className="text-[11px] text-zinc-400 tabular-nums"
                  title={`Totaux : ${gTodo} à traiter · ${gWip} en cours · ${gDone} terminés`}
                >
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
              </div>
              {/* Legende des colonnes : alignee a droite, meme largeur que les
                  Counter dans les rows pour signaler "ces 3 colonnes = ces 3
                  statuts". Masquee en mobile (compteurs compactes sur 1 ligne). */}
              <div className="hidden sm:flex items-center gap-3 justify-end text-[9px] uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500 pr-[156px]">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" aria-hidden />
                  À faire
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
                  En cours
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />
                  Terminé
                </span>
              </div>
            </header>

            {/* Liste des rows sans divides : les rows sont separees par
                leur padding vertical seul. Aucune ligne entre. */}
            <div>
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

      {/* 3 compteurs alignés verticalement, largeur fixe. Le 0 est en gris
          discret → l'œil se concentre sur ce qui n'est pas zéro.
          Au survol : mini-tooltip "À faire : 5" avec pastille de couleur. */}
      <div className="hidden sm:flex items-center gap-1 shrink-0 tabular-nums">
        <Counter value={row.todo} color="rose" label="À faire" />
        <Counter value={row.wip} color="amber" label="En cours" />
        <Counter value={row.done} color="emerald" label="Terminé" />
      </div>

      {/* Sur mobile : compteurs compactés en une ligne - meme info en tooltip. */}
      <div
        className="sm:hidden flex items-center gap-1.5 shrink-0 text-[11px] tabular-nums"
        title={`${row.todo} à traiter · ${row.wip} en cours · ${row.done} terminés`}
      >
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
          3 niveaux de mise en valeur :
            - rouge (en retard) : au moins une obligation depassee + pas terminée
            - ambre (urgent) : prochaine echeance dans 30j
            - zinc (calme) : echeance lointaine ou aucune */}
      <div
        className={cn(
          "hidden md:flex items-center gap-1.5 shrink-0 text-[11px] tabular-nums w-32 justify-end",
          row.enRetard > 0
            ? "text-rose-700 font-semibold"
            : urgent
            ? "text-amber-700 font-medium"
            : "text-zinc-500"
        )}
        title={
          row.enRetard > 0
            ? `${row.enRetard} obligation${row.enRetard > 1 ? "s" : ""} en retard${row.prochaineEcheance ? ` · prochaine echeance restante : ${fmtDateFr(row.prochaineEcheance)}` : ""}`
            : row.prochaineEcheance
            ? `Prochaine échéance ${urgent ? "(urgent - dans moins de 30 j)" : ""} : ${fmtDateFr(row.prochaineEcheance)}`
            : "Aucune échéance à venir sur ce tracker"
        }
      >
        {row.enRetard > 0 ? (
          <>
            <CalendarDays className="h-3 w-3 text-rose-500" aria-hidden="true" />
            <span>
              {row.enRetard} en retard
            </span>
          </>
        ) : row.prochaineEcheance ? (
          <>
            <CalendarDays className={cn("h-3 w-3", urgent ? "text-amber-500" : "text-zinc-400")} aria-hidden="true" />
            <span>{fmtDateFr(row.prochaineEcheance)}</span>
          </>
        ) : (
          <span className="text-zinc-300">-</span>
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

/**
 * Compteur d'une categorie de statut sur un tracker. Au survol : mini-tooltip
 * portaille qui rappelle le label + la pastille de couleur ("En cours : 1").
 *
 * Le compteur lui-meme n'est pas cliquable : c'est la row entiere qui
 * navigue vers le tracker. On utilise un <span> (et pas un <button>) pour
 * eviter button-in-button.
 */
function Counter({
  value,
  color,
  label,
}: {
  value: number;
  color: "rose" | "amber" | "emerald";
  label: string;
}) {
  const muted = value === 0;
  const palette = {
    rose: { bg: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
    amber: { bg: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
    emerald: { bg: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  } as const;

  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || !ref.current) {
      setPos(null);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const POPOVER_WIDTH = 140;
    const POPOVER_HEIGHT = 36;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    const rawLeft = rect.left + rect.width / 2;
    const halfW = POPOVER_WIDTH / 2;
    const clampedLeft = Math.max(
      MARGIN + halfW,
      Math.min(rawLeft, window.innerWidth - MARGIN - halfW)
    );
    setPos({ left: clampedLeft, top: openUp ? rect.top : rect.bottom, openUp });
  }, [open]);

  function onEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function onLeave() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 80);
  }

  return (
    <>
      <span
        ref={ref}
        tabIndex={0}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        aria-label={`${label} : ${value}`}
        className={cn(
          "inline-block min-w-[36px] px-1.5 py-1 rounded text-[11px] font-semibold text-center tabular-nums cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
          muted
            ? "bg-transparent text-zinc-400 dark:text-zinc-600"
            : palette[color].bg
        )}
      >
        {value}
      </span>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
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
            className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-md shadow-lg text-[11px] font-medium whitespace-nowrap pointer-events-none animate-slide-up-fade"
          >
            <span
              className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", palette[color].dot)}
              aria-hidden
            />
            <span>
              {label} :{" "}
              <span className="tabular-nums font-semibold">{value}</span>
            </span>
          </div>,
          document.body
        )}
    </>
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

// ============================================================================
//  ChargeAVenir : bande visuelle de la charge a venir, par bucket temporel
// ============================================================================
//
//  Permet de voir d'un coup d'oeil la "vague" d'echeances qui arrive :
//  combien d'obligations en retard, combien cette semaine, ce mois, etc.
//  Chaque bucket est cliquable -> page /obligations/echeances filtree.

function ChargeAVenir({ charge }: { charge: Charge }) {
  const buckets = [
    {
      key: "enRetard",
      label: "En retard",
      value: charge.enRetard,
      color: "rose" as const,
      href: "/obligations/echeances?filter=overdue",
    },
    {
      key: "cetteSemaine",
      label: "≤ 7 jours",
      value: charge.cetteSemaine,
      color: "amber" as const,
      href: "/obligations/echeances?filter=7j",
    },
    {
      key: "ceMois",
      label: "≤ 30 jours",
      value: charge.ceMois,
      color: "sky" as const,
      href: "/obligations/echeances?filter=30j",
    },
    {
      key: "moisProchain",
      label: "Mois +1",
      value: charge.moisProchain,
      color: "zinc" as const,
    },
    {
      key: "deuxMois",
      label: "Mois +2",
      value: charge.deuxMois,
      color: "zinc" as const,
    },
    {
      key: "plusTard",
      label: "Plus tard",
      value: charge.plusTard,
      color: "zinc" as const,
    },
  ];

  // Calculer la valeur max pour les barres de hauteur proportionnelle
  const maxValue = Math.max(...buckets.map((b) => b.value), 1);

  const colorBar: Record<"rose" | "amber" | "sky" | "zinc", string> = {
    rose: "bg-rose-500 dark:bg-rose-400",
    amber: "bg-amber-500 dark:bg-amber-400",
    sky: "bg-sky-500 dark:bg-sky-400",
    zinc: "bg-zinc-300 dark:bg-zinc-600",
  };
  const colorText: Record<"rose" | "amber" | "sky" | "zinc", string> = {
    rose: "text-rose-700 dark:text-rose-300",
    amber: "text-amber-700 dark:text-amber-300",
    sky: "text-sky-700 dark:text-sky-300",
    zinc: "text-zinc-600 dark:text-zinc-300",
  };

  return (
    <section className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden">
      <header className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.04] bg-zinc-50/40 dark:bg-white/[0.02]">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
          Charge à venir
        </h2>
        <p className="text-[10px] text-zinc-400 mt-0.5">
          Obligations non terminées · échéances calculées par type
        </p>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-zinc-100 dark:divide-white/[0.04]">
        {buckets.map((b) => {
          const ratio = b.value / maxValue;
          const className = cn(
            "group/bucket flex flex-col items-center justify-between gap-2 px-3 py-3 transition-colors",
            b.href && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
          );
          const body = (
            <>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                {b.label}
              </div>
              <div className="w-full h-9 flex items-end justify-center">
                <div
                  className={cn(
                    "w-6 rounded-t transition-all",
                    colorBar[b.color],
                    b.value === 0 && "opacity-30"
                  )}
                  style={{ height: `${Math.max(ratio * 100, 8)}%` }}
                  aria-hidden
                />
              </div>
              <div className={cn(
                "text-xl font-semibold tabular-nums",
                b.value === 0 ? "text-zinc-300 dark:text-zinc-600" : colorText[b.color]
              )}>
                {b.value}
              </div>
            </>
          );
          return b.href ? (
            <Link key={b.key} href={b.href} className={className}>
              {body}
            </Link>
          ) : (
            <div key={b.key} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
