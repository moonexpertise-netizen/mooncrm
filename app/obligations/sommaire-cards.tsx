"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { cn, fmtDateFr } from "@/lib/utils";
import { TRACKER_GROUPS, type TrackerGroup } from "./trackers";

export type ClientLite = {
  slug: string;
  denomination: string;
  echeance: string | null;
  statut_detail: string | null;
};

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
  /** Liste de clients par statut (max 20, tries par echeance). Affiches
   *  dans le popover au survol des compteurs. */
  todoClients: ClientLite[];
  wipClients: ClientLite[];
  doneClients: ClientLite[];
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

      {/* Sections par groupe — chaque groupe = une card distincte avec
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
  // Tooltip global de la ligne : recap rapide + nb total pour le contexte.
  const rowTitle = empty
    ? `${row.title} · aucune obligation`
    : `${row.title} · ${row.total} obligation${row.total > 1 ? "s" : ""} (${row.todo} à traiter, ${row.wip} en cours, ${row.done} terminés)`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      title={rowTitle}
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
          Au survol : popover riche avec la liste des clients concernés. */}
      <div className="hidden sm:flex items-center gap-1 shrink-0 tabular-nums">
        <Counter
          value={row.todo}
          color="rose"
          label="À faire"
          clients={row.todoClients}
          totalCount={row.todo}
          trackerTitle={row.title}
        />
        <Counter
          value={row.wip}
          color="amber"
          label="En cours"
          clients={row.wipClients}
          totalCount={row.wip}
          trackerTitle={row.title}
        />
        <Counter
          value={row.done}
          color="emerald"
          label="Terminé"
          clients={row.doneClients}
          totalCount={row.done}
          trackerTitle={row.title}
        />
      </div>

      {/* Sur mobile : compteurs compactés en une ligne — meme info en tooltip. */}
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
          Mise en valeur si elle approche (urgent = dans 30j). */}
      <div
        className={cn(
          "hidden md:flex items-center gap-1.5 shrink-0 text-[11px] tabular-nums w-28 justify-end",
          urgent ? "text-amber-700 font-medium" : "text-zinc-500"
        )}
        title={
          row.prochaineEcheance
            ? `Prochaine échéance ${urgent ? "(urgent — dans moins de 30 j)" : ""} : ${fmtDateFr(row.prochaineEcheance)}`
            : "Aucune échéance à venir sur ce tracker"
        }
      >
        {row.prochaineEcheance ? (
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

function Counter({
  value,
  color,
  label,
  clients,
  totalCount,
  trackerTitle,
}: {
  value: number;
  color: "rose" | "amber" | "emerald";
  label: string;
  clients: ClientLite[];
  /** Compte reel (peut etre > clients.length si liste tronquee a 20) */
  totalCount: number;
  trackerTitle: string;
}) {
  const muted = value === 0;
  const palette = {
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  } as const;

  // Span (et pas button) pour eviter button imbrique dans le button TrackerRow
  // qui est invalide HTML. tabIndex + role="button" pour le focus clavier.
  const ref = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Position du popover : calcule au survol (mouseEnter), clamp viewport.
  useEffect(() => {
    if (!open || !ref.current) {
      setPos(null);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const POPOVER_WIDTH = 300;
    const POPOVER_HEIGHT = 260;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    // On centre le popover au-dessus du counter, en clampant pour rester
    // dans le viewport.
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
  }, [open]);

  // Hover avec petit delai a la fermeture pour permettre d'aller cliquer
  // sur un client dans le popover sans qu'il se ferme trop vite.
  function onEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function onLeave() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  // Eviter de stopper la propagation pour ne pas casser le clic sur la
  // row entiere (qui navigue vers le tracker). Le popover lui-meme stoppe.
  return (
    <>
      <span
        ref={ref}
        tabIndex={value > 0 ? 0 : -1}
        role={value > 0 ? "button" : undefined}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        aria-label={value > 0 ? `${value} ${label.toLowerCase()} (survoler pour la liste)` : undefined}
        className={cn(
          "inline-block min-w-[36px] px-1.5 py-1 rounded text-[11px] font-semibold text-center tabular-nums transition-colors",
          muted
            ? "bg-transparent text-zinc-400 dark:text-zinc-600"
            : palette[color],
          !muted && "hover:brightness-95 cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        )}
      >
        {value}
      </span>

      {open && pos && value > 0 && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            // empeche le clic sur le popover de declencher le navigate du parent
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              transform: pos.openUp
                ? "translate(-50%, calc(-100% - 8px))"
                : "translate(-50%, 8px)",
              zIndex: 1000,
            }}
            className="w-[300px] bg-white dark:bg-[hsl(var(--surface-elevated))] border border-zinc-200 dark:border-white/[0.10] rounded-lg shadow-xl overflow-hidden animate-slide-up-fade"
          >
            {/* Header du popover */}
            <div className="px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.03]">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">
                  {label} · {trackerTitle}
                </div>
                <div className="text-[11px] tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
                  {totalCount}
                </div>
              </div>
            </div>
            {/* Liste des clients */}
            <ul className="max-h-[280px] overflow-y-auto py-1">
              {clients.map((c) => (
                <li key={`${c.slug}-${c.echeance ?? ""}`}>
                  <Link
                    href={`/clients/${c.slug}/obligations`}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="flex-1 truncate text-zinc-800 dark:text-zinc-100">
                      {c.denomination}
                    </span>
                    {c.echeance && (
                      <span className="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {fmtDateFr(c.echeance)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
              {totalCount > clients.length && (
                <li className="px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                  … et {totalCount - clients.length} autre{totalCount - clients.length > 1 ? "s" : ""}
                </li>
              )}
            </ul>
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
