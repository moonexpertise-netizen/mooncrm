"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { cn, fmtDateFr } from "@/lib/utils";
import { Picker } from "@/app/_components/picker";
import { setEcheanceStatus } from "./actions";
import type { SerializedEcheanceItem, EcheanceStatusOption } from "./page";

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
  statusOptionsByType,
}: {
  month: number;
  year: number;
  duMois: SerializedEcheanceItem[];
  enRetard: SerializedEcheanceItem[];
  /** Indexe par type_code -> liste des libelles disponibles (avec leur
   *  statut_logique pour determiner la couleur d'affichage). */
  statusOptionsByType: Record<string, EcheanceStatusOption[]>;
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
          statusOptionsByType={statusOptionsByType}
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
        statusOptionsByType={statusOptionsByType}
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
  statusOptionsByType,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: "rose" | "amber";
  items: SerializedEcheanceItem[];
  emptyState?: string | null;
  statusOptionsByType: Record<string, EcheanceStatusOption[]>;
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
                    options={statusOptionsByType[it.type] ?? []}
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
//  Ligne d'echeance avec picker statut interactif
// ============================================================================

/**
 * Determine la classe Tailwind du chip statut. Repris du style picker pour
 * coherence visuelle (texte + bg colores selon statut_logique). Si une
 * option custom a une color, on l'utilise ; sinon fallback par logique.
 */
function statutChipColor(
  statut: SerializedEcheanceItem["statut"],
  optionColor?: string
): string {
  if (optionColor) return optionColor;
  if (statut === "TERMINE") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30";
  }
  if (statut === "EN_COURS") {
    return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30";
  }
  if (statut === "NON_APPLICABLE") {
    return "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-white/[0.05] dark:text-zinc-400 dark:border-white/[0.08]";
  }
  // A_FAIRE / null
  return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30";
}

function EcheanceRow({
  item,
  options,
}: {
  item: SerializedEcheanceItem;
  options: EcheanceStatusOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // State local : reflete la derniere valeur "promise" par le user. Permet
  // un feedback immediat avant que router.refresh() ne ramene la vraie
  // valeur du serveur. obligationId peut etre cree au 1er pick (cas
  // virtual), on le memorise pour les pick suivants.
  const [localObligationId, setLocalObligationId] = useState(item.obligationId);
  const [localStatutDetail, setLocalStatutDetail] = useState(item.statutDetail);
  const [localStatut, setLocalStatut] = useState(item.statut);
  const [pending, setPending] = useState(false);

  const isOverdue = item.daysOffset < 0;
  const isToday = item.daysOffset === 0;

  // Libelle relatif (en retard de X jours / dans X jours / aujourd'hui)
  const relative = isOverdue
    ? `${Math.abs(item.daysOffset)}j en retard`
    : isToday
    ? "aujourd'hui"
    : `dans ${item.daysOffset}j`;

  // Options pour le picker : on les groupe par statut_logique pour avoir
  // les headers "À faire / En cours / Terminé / N/A" comme dans le tracker.
  const pickerOptions = useMemo(() => {
    const GROUP_LABEL: Record<EcheanceStatusOption["statut_logique"], string> = {
      A_FAIRE: "À faire",
      EN_COURS: "En cours",
      TERMINE: "Terminé",
      NON_APPLICABLE: "N/A",
    };
    return options.map((o) => ({
      key: o.libelle,
      label: o.libelle,
      color: o.color,
      group: GROUP_LABEL[o.statut_logique],
    }));
  }, [options]);

  // Couleur affichee : on cherche d'abord l'option qui matche le libelle
  // courant pour avoir la couleur exacte, sinon fallback selon statut_logique.
  const matchedOption = options.find((o) => o.libelle === localStatutDetail);
  const colorClass = statutChipColor(localStatut, matchedOption?.color);

  async function handlePick(libelle: string | null) {
    setPending(true);
    // Optimistic : on update tout de suite l'affichage local. Le serveur
    // confirmera derriere (le router.refresh() retirera la ligne si c'est
    // un TERMINE/NA, ou ramene la valeur reelle si autre).
    setLocalStatutDetail(libelle);
    const opt = libelle ? options.find((o) => o.libelle === libelle) : null;
    setLocalStatut(opt ? opt.statut_logique : "A_FAIRE");

    try {
      const result = await setEcheanceStatus(
        {
          obligationId: localObligationId,
          clientId: item.clientId,
          type: item.type,
          periode: item.periode,
          annee: item.annee,
        },
        libelle
      );
      // Memorise l'id si on vient de creer la ligne (cas virtual)
      if (!localObligationId) setLocalObligationId(result.obligationId);
      // Refresh : si TERMINE/NA, la ligne sortira de la liste cote engine ;
      // sinon le statut affiche sera reconfirme.
      startTransition(() => router.refresh());
    } catch (err) {
      // Revert le state local en cas d'erreur serveur
      console.error("setEcheanceStatus failed", err);
      setLocalStatutDetail(item.statutDetail);
      setLocalStatut(item.statut);
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-2 md:grid md:grid-cols-12 md:items-center md:gap-3 px-4 py-3 hover:bg-zinc-50/60 dark:hover:bg-white/[0.03] transition-colors",
        pending && "opacity-70"
      )}
    >
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
        {/* En mobile : statut picker + lien a droite */}
        <div className="flex items-center gap-2 md:hidden shrink-0">
          <StatusPicker
            value={localStatutDetail}
            colorClass={colorClass}
            options={pickerOptions}
            onPick={handlePick}
            placeholder="À faire"
            disabled={pending || options.length === 0}
          />
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

      {/* Statut picker + lien tracker : visible UNIQUEMENT en desktop
          (en mobile dans la 1ere ligne, a cote du client) */}
      <div className="hidden md:flex md:col-span-2 items-center justify-end gap-2">
        <StatusPicker
          value={localStatutDetail}
          colorClass={colorClass}
          options={pickerOptions}
          onPick={handlePick}
          placeholder="À faire"
          disabled={pending || options.length === 0}
        />
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

// ============================================================================
//  StatusPicker : wrapper du Picker avec le bon styling
// ============================================================================
//
// Petit adaptateur autour de Picker pour :
//   1. Forcer la color du chip courant selon le statut_logique (pas juste
//      celle de l'option matched) -> coherence visuelle si aucune option
//      ne matche un libelle saisi ailleurs.
//   2. Gerer le reset (-> A_FAIRE par defaut, libelle remis cote serveur).
//   3. Fallback discret si aucune option n'est dispo (type sans config).

function StatusPicker({
  value,
  colorClass,
  options,
  onPick,
  placeholder,
  disabled,
}: {
  value: string | null;
  colorClass: string;
  options: Array<{ key: string; label: string; color: string; group?: string }>;
  onPick: (libelle: string | null) => void;
  placeholder: string;
  disabled: boolean;
}) {
  // Si pas d'options dispo (type orphan, ne devrait pas arriver mais
  // garde-fou), on affiche un chip read-only.
  if (options.length === 0) {
    return (
      <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium border", colorClass)}>
        {value ?? placeholder}
      </span>
    );
  }

  // Surcharge la couleur de l'option courante pour que le chip refleche
  // notre colorClass (ex. amber pour A_FAIRE) plutot que celle de l'option
  // (souvent generique).
  const pickerOptions = options.map((o) =>
    o.key === value ? { ...o, color: colorClass } : o
  );
  // Ajoute une option synthetique pour la valeur courante quand elle ne
  // matche aucune option active (libelle obsolete d'un ancien parametrage).
  const hasMatch = options.some((o) => o.key === value);
  if (value && !hasMatch) {
    pickerOptions.unshift({ key: value, label: value, color: colorClass });
  }

  return (
    <Picker
      value={value}
      options={pickerOptions}
      onChange={(libelle) => onPick(libelle)}
      onReset={() => onPick(null)}
      resetLabel="Réinitialiser"
      allowEmpty
      placeholder={placeholder}
      placeholderTitle="Cliquer pour choisir un statut"
      align="right"
      size="sm"
      minWidth={200}
      disabled={disabled}
    />
  );
}
