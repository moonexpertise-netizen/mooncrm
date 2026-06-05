"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, AlertTriangle, Calendar, ExternalLink } from "lucide-react";
import { cn, fmtDateFr } from "@/lib/utils";
import type { SerializedEcheanceItem } from "./page";

const MOIS_LABEL = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function moisLabel(m: number, y: number): string {
  return `${MOIS_LABEL[m - 1]} ${y}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Format ?month= "YYYY-MM" pour navigation. */
function monthParam(m: number, y: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function addMonth(m: number, y: number, delta: number): { month: number; year: number } {
  const idx = (y * 12 + (m - 1)) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

// ============================================================================
//  Composant principal
// ============================================================================

export default function EcheancesList({
  month,
  year,
  duMois,
  enRetard,
}: {
  month: number;
  year: number;
  duMois: SerializedEcheanceItem[];
  enRetard: SerializedEcheanceItem[];
}) {
  const router = useRouter();

  const prev = useMemo(() => addMonth(month, year, -1), [month, year]);
  const next = useMemo(() => addMonth(month, year, 1), [month, year]);

  // Saut au mois courant
  const todayMonth = useMemo(() => {
    const d = new Date();
    return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
  }, []);
  const isCurrentMonth = month === todayMonth.month && year === todayMonth.year;

  return (
    <div className="space-y-5">
      {/* Selecteur de mois : fleches gauche/droite + libelle central + saut mois courant */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => router.push(`/obligations?month=${monthParam(prev.month, prev.year)}`)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors"
          title={cap(moisLabel(prev.month, prev.year))}
          aria-label="Mois precedent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="px-4 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.15] bg-white dark:bg-white/[0.08] text-sm font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums min-w-[180px] text-center">
          {cap(moisLabel(month, year))}
        </div>
        <button
          type="button"
          onClick={() => router.push(`/obligations?month=${monthParam(next.month, next.year)}`)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition-colors"
          title={cap(moisLabel(next.month, next.year))}
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={() => router.push(`/obligations?month=${monthParam(todayMonth.month, todayMonth.year)}`)}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 ml-1"
          >
            Revenir au mois courant
          </button>
        )}
      </div>

      {/* En retard : section rouge en haut si non vide */}
      {enRetard.length > 0 && (
        <Section
          title="En retard"
          subtitle={`${enRetard.length} obligation${enRetard.length > 1 ? "s" : ""} non terminée${enRetard.length > 1 ? "s" : ""} dont l'échéance est passée avant le 1er ${MOIS_LABEL[month - 1]}.`}
          icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
          accent="rose"
          items={enRetard}
        />
      )}

      {/* A traiter ce mois */}
      <Section
        title={`À traiter en ${MOIS_LABEL[month - 1]} ${year}`}
        subtitle={
          duMois.length === 0
            ? "Aucune échéance ne tombe ce mois-ci."
            : `${duMois.length} obligation${duMois.length > 1 ? "s" : ""} à échéance entre le 1er et le ${new Date(year, month, 0).getDate()} ${MOIS_LABEL[month - 1]}.`
        }
        icon={<Calendar className="h-4 w-4 text-amber-500" />}
        accent="amber"
        items={duMois}
        emptyState={duMois.length === 0 ? "Rien à traiter ce mois-ci." : null}
      />
    </div>
  );
}

// ============================================================================
//  Section : header + liste d'echeances
// ============================================================================

function Section({
  title,
  subtitle,
  icon,
  accent,
  items,
  emptyState,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: "rose" | "amber";
  items: SerializedEcheanceItem[];
  emptyState?: string | null;
}) {
  // Decoupage par tracker pour lisibilite. On preserve l'ordre d'arrivee
  // des items (deja triees par dueDate) -> les groupes apparaissent dans
  // l'ordre du 1er item de chaque tracker.
  const groups = useMemo(() => {
    const byTracker = new Map<string, { title: string; items: SerializedEcheanceItem[] }>();
    for (const it of items) {
      const existing = byTracker.get(it.trackerSlug);
      if (existing) {
        existing.items.push(it);
      } else {
        byTracker.set(it.trackerSlug, { title: it.trackerTitle, items: [it] });
      }
    }
    return Array.from(byTracker.entries()).map(([slug, g]) => ({ slug, ...g }));
  }, [items]);

  return (
    <section className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden">
      <header className={cn(
        "flex items-start gap-3 px-4 py-3 border-b",
        accent === "rose"
          ? "bg-rose-50/40 dark:bg-rose-500/[0.06] border-rose-100 dark:border-rose-500/20"
          : "bg-amber-50/30 dark:bg-amber-500/[0.05] border-zinc-100 dark:border-white/[0.04]",
      )}>
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {title}
          </h2>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>
        </div>
      </header>
      {emptyState ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
          {emptyState}
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
          {groups.map((g) => (
            <div key={g.slug}>
              {/* Sous-header par tracker : nom + compteur */}
              <div className="flex items-baseline justify-between gap-3 px-4 py-2 bg-zinc-50/60 dark:bg-white/[0.02] border-b border-zinc-100 dark:border-white/[0.04]">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
                  {g.title}
                </h3>
                <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {g.items.length} {g.items.length > 1 ? "obligations" : "obligation"}
                </span>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                {g.items.map((it) => (
                  <EcheanceRow
                    key={`${it.clientId}|${it.type}|${it.annee}|${it.periode}`}
                    item={it}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
//  Ligne d'echeance
// ============================================================================

function EcheanceRow({ item }: { item: SerializedEcheanceItem }) {
  const isOverdue = item.daysOffset < 0;
  const isToday = item.daysOffset === 0;

  // Libelle relatif (en retard de X jours / dans X jours / aujourd'hui)
  const relative = isOverdue
    ? `${Math.abs(item.daysOffset)}j en retard`
    : isToday
    ? "aujourd'hui"
    : `dans ${item.daysOffset}j`;

  // Statut affiche (TERMINE = vert, EN_COURS = ambre, A_FAIRE / null = neutre)
  const statutLabel = (() => {
    if (item.statutDetail) return item.statutDetail;
    if (!item.statut) return "À faire";
    if (item.statut === "A_FAIRE") return "À faire";
    if (item.statut === "EN_COURS") return "En cours";
    if (item.statut === "TERMINE") return "Terminé";
    return "N/A";
  })();
  const statutColor =
    item.statut === "TERMINE"
      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15"
      : item.statut === "EN_COURS"
      ? "text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/15"
      : item.statut === "NON_APPLICABLE"
      ? "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/[0.05]"
      : "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15";

  return (
    <li className="flex flex-col gap-2 md:grid md:grid-cols-12 md:items-center md:gap-3 px-4 py-3 hover:bg-zinc-50/60 dark:hover:bg-white/[0.03] transition-colors">
      {/* Ligne 1 mobile : Client + Statut + lien tracker (cote a cote)
          Desktop : col-span-3 isole */}
      <div className="flex items-center justify-between gap-2 md:col-span-3 md:min-w-0 md:block">
        <div className="min-w-0 flex-1">
          <Link
            href={`/clients/${item.clientSlug}`}
            className="font-medium text-sm text-zinc-900 dark:text-zinc-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors truncate block"
            title={item.clientName}
          >
            {item.clientName}
          </Link>
          {item.clientSiren && (
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">{item.clientSiren}</div>
          )}
        </div>
        {/* En mobile : statut + lien a droite de la ligne client */}
        <div className="flex items-center gap-2 md:hidden shrink-0">
          <span
            className={cn(
              "px-2 py-1 rounded text-[11px] font-medium",
              statutColor,
            )}
          >
            {statutLabel}
          </span>
          <Link
            href={`/obligations/${item.trackerSlug}?year=${item.annee}&focus=${item.clientSlug}`}
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            title="Ouvrir la cellule dans le tracker"
            aria-label="Ouvrir la cellule dans le tracker"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Ligne 2 mobile : Obligation + periode. Desktop col-span-4 */}
      <div className="md:col-span-4 min-w-0">
        <Link
          href={`/obligations/${item.trackerSlug}?year=${item.annee}`}
          className="text-sm text-zinc-700 dark:text-zinc-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors truncate block"
          title={`Aller au tracker ${item.trackerTitle}`}
        >
          {item.trackerTitle}
        </Link>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {item.periodeLabel}
          {item.clotureLabel && (
            <span className="ml-2 text-zinc-400 dark:text-zinc-500">
              · clôture {item.clotureLabel}
            </span>
          )}
        </div>
      </div>

      {/* Ligne 3 mobile : Echeance (date + relatif). Desktop col-span-3 */}
      <div className="md:col-span-3 min-w-0">
        <div
          className={cn(
            "text-sm tabular-nums font-medium",
            isOverdue ? "text-rose-600 dark:text-rose-400" : "text-zinc-800 dark:text-zinc-200",
          )}
        >
          {fmtDateFr(item.dueDateIso)}
        </div>
        <div
          className={cn(
            "text-[11px]",
            isOverdue ? "text-rose-500 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400",
          )}
        >
          {relative}
        </div>
      </div>

      {/* Statut + lien tracker : visible UNIQUEMENT en desktop (en mobile dans
          la 1ere ligne, a cote du client) */}
      <div className="hidden md:flex md:col-span-2 items-center justify-end gap-2">
        <span
          className={cn(
            "px-2 py-0.5 rounded text-[11px] font-medium",
            statutColor,
          )}
          title={item.statut === null ? "Pas encore saisi en DB · placeholder du tracker" : statutLabel}
        >
          {statutLabel}
        </span>
        <Link
          href={`/obligations/${item.trackerSlug}?year=${item.annee}&focus=${item.clientSlug}`}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          title="Ouvrir la cellule dans le tracker"
          aria-label="Ouvrir la cellule dans le tracker"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </li>
  );
}
