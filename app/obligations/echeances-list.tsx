"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Calendar,
  CalendarCheck,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { cn, fmtDateFr, statutColorClass } from "@/lib/utils";
import { Picker } from "@/app/_components/picker";
import { setEcheanceStatus, ensureObligationRow } from "./actions";
import CommentsPopover from "./[tracker]/comments-panel";
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
  commentCounts,
  currentUserEmail,
}: {
  month: number;
  year: number;
  duMois: SerializedEcheanceItem[];
  enRetard: SerializedEcheanceItem[];
  /** Indexe par type_code -> liste des libelles disponibles (avec leur
   *  statut_logique pour determiner la couleur d'affichage). */
  statusOptionsByType: Record<string, EcheanceStatusOption[]>;
  /** Indexe par obligationId -> nombre de commentaires. Vide pour les
   *  obligations virtuelles (sans id DB). */
  commentCounts: Record<string, number>;
  /** Email utilisateur courant, transmis au popover commentaires. */
  currentUserEmail: string | null;
}) {
  const router = useRouter();

  // Anti cache stale : Next.js Router Cache garde une version cachee de la
  // page 30s (cf. experimental.staleTimes.dynamic dans next.config.mjs).
  // Sur /obligations c'est embetant : si on a marque des trucs en Terminé
  // depuis une autre page (Jarvis, tracker, etc.), on revoit a tort des
  // echeances rouges qui n'existent plus jusqu'a F5. router.refresh() au
  // mount force une re-fetch RSC -> les bonnes donnees arrivent en <1s.
  useEffect(() => {
    router.refresh();
    // exhaustive-deps : on veut un refresh une seule fois au mount, pas
    // sur chaque re-render apres une action utilisateur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prev = useMemo(() => addMonth(month, year, -1), [month, year]);
  const next = useMemo(() => addMonth(month, year, 1), [month, year]);

  // Saut au mois courant
  const todayMonth = useMemo(() => {
    const d = new Date();
    return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
  }, []);
  const isCurrentMonth = month === todayMonth.month && year === todayMonth.year;

  // State : popover commentaires ouvert (un seul a la fois). Le obligationId
  // est materialise au besoin (cas virtuel) avant d'ouvrir le popover.
  const [openComments, setOpenComments] = useState<{
    obligationId: string;
    label: string;
    anchor: { left: number; top: number; bottom: number; right: number };
  } | null>(null);

  // Counts locaux : on commence avec les counts serveur, on patche au fil
  // des add/delete cote popover (via onCountChange) pour eviter un refresh.
  const [localCommentCounts, setLocalCommentCounts] = useState(commentCounts);

  function handleCountChange(obligationId: string, count: number) {
    setLocalCommentCounts((prev) => ({ ...prev, [obligationId]: count }));
  }

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
          commentCounts={localCommentCounts}
          onOpenComments={(payload) => setOpenComments(payload)}
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
        commentCounts={localCommentCounts}
        onOpenComments={(payload) => setOpenComments(payload)}
      />

      {/* Popover commentaires (style Notion). Memes commentaires que dans
          le tracker car partagent obligation_id. */}
      {openComments && (
        <CommentsPopover
          obligationId={openComments.obligationId}
          obligationLabel={openComments.label}
          currentUserEmail={currentUserEmail}
          anchorRect={openComments.anchor}
          onClose={() => setOpenComments(null)}
          onCountChange={(count) => handleCountChange(openComments.obligationId, count)}
        />
      )}
    </div>
  );
}

// ============================================================================
//  Section : header + liste d'echeances
// ============================================================================

type OpenCommentsPayload = {
  obligationId: string;
  label: string;
  anchor: { left: number; top: number; bottom: number; right: number };
};

function Section({
  title,
  subtitle,
  icon,
  accent,
  items,
  emptyState,
  statusOptionsByType,
  commentCounts,
  onOpenComments,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: "rose" | "amber";
  items: SerializedEcheanceItem[];
  emptyState?: string | null;
  statusOptionsByType: Record<string, EcheanceStatusOption[]>;
  commentCounts: Record<string, number>;
  onOpenComments: (payload: OpenCommentsPayload) => void;
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
    <section className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-hidden">
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
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </header>
      {emptyState ? (
        <div className="flex flex-col items-center justify-center text-center py-10 px-4">
          <CalendarCheck className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            {emptyState}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Rien ne tombe sur cette période.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
          {groups.map((g) => (
            <div key={g.slug}>
              {/* Sous-header par tracker : nom + compteur */}
              <div className="flex items-baseline justify-between gap-3 px-4 py-2 bg-zinc-50/60 dark:bg-white/[0.02] border-b border-zinc-100 dark:border-white/[0.04]">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.title}
                </h3>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {g.items.length} {g.items.length > 1 ? "obligations" : "obligation"}
                </span>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                {g.items.map((it) => (
                  <EcheanceRow
                    key={`${it.clientId}|${it.type}|${it.annee}|${it.periode}`}
                    item={it}
                    options={statusOptionsByType[it.type] ?? []}
                    commentCounts={commentCounts}
                    onOpenComments={onOpenComments}
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
//  Ligne d'echeance avec picker statut interactif + bouton commentaires
// ============================================================================

function EcheanceRow({
  item,
  options,
  commentCounts,
  onOpenComments,
}: {
  item: SerializedEcheanceItem;
  options: EcheanceStatusOption[];
  commentCounts: Record<string, number>;
  onOpenComments: (payload: OpenCommentsPayload) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Override optimistic uniquement pendant l'action serveur. Une fois
  // l'action terminee et router.refresh() acheve (= item prop change),
  // on clear l'override pour suivre la verite serveur. Evite les
  // "donnees bizarres" persistantes vues entre l'action et le refresh.
  const [optimistic, setOptimistic] = useState<{
    statutDetail: string | null;
    statut: SerializedEcheanceItem["statut"];
  } | null>(null);
  // Memorise l'id si on vient de creer la ligne (cas virtual) pour pouvoir
  // attacher les commentaires immediatement. Le router.refresh() ramenera
  // l'item.obligationId reel, donc on clear ensuite.
  const [createdObligationId, setCreatedObligationId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  pendingRef.current = pending;

  // Quand l'item prop change (apres router.refresh), on clear l'override.
  // C'est crucial pour que la ligne refleche la verite serveur apres une
  // modif - sinon useState garderait l'optimistic indefiniment et on
  // verrait des incoherences (anciennes valeurs persistantes).
  useEffect(() => {
    if (!pendingRef.current) {
      setOptimistic(null);
      setCreatedObligationId(null);
    }
  }, [item.obligationId, item.statutDetail, item.statut]);

  const effectiveObligationId = item.obligationId ?? createdObligationId;

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
  // Chaque option est resolue en classe Tailwind via statutColorClass
  // (la color DB est un keyword "amber"/"emerald"/... pas une classe).
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
      color: statutColorClass(o.statut_logique, o.color),
      group: GROUP_LABEL[o.statut_logique],
    }));
  }, [options]);

  // Valeur effectivement affichee. Priorite :
  //   1. override optimistic (en cours d'action)
  //   2. statut serveur (item.statutDetail / item.statut)
  //   3. null -> rendu via placeholderColor (chip "À faire" amber)
  //
  // Ne PAS deviner un libelle "par defaut" du type : ca tombait sur
  // n'importe quel libelle A_FAIRE custom selon l'ordre DB (ex. user
  // avait ajoute "Rejetee - a renvoyer" en ordre 0 -> toutes les TVA
  // virtuelles affichaient "Rejetee" alors que le seed defaut est
  // "Pas commence" en ordre 10). Cf. bug rapporte 06/2026.
  const displayStatutDetail = optimistic?.statutDetail ?? item.statutDetail;
  const displayStatut: SerializedEcheanceItem["statut"] =
    optimistic?.statut ?? item.statut ?? "A_FAIRE";

  const commentCount = effectiveObligationId
    ? commentCounts[effectiveObligationId] ?? 0
    : 0;

  async function handlePick(libelle: string | null) {
    setPending(true);
    // Optimistic : on update tout de suite l'affichage. Sera clear quand
    // l'item prop change (= apres que le router.refresh ait ramene la
    // verite serveur).
    const opt = libelle ? options.find((o) => o.libelle === libelle) : null;
    setOptimistic({
      statutDetail: libelle,
      statut: opt ? opt.statut_logique : "A_FAIRE",
    });

    try {
      const result = await setEcheanceStatus(
        {
          obligationId: effectiveObligationId,
          clientId: item.clientId,
          type: item.type,
          periode: item.periode,
          annee: item.annee,
        },
        libelle
      );
      // Memorise l'id si on vient de creer la ligne (cas virtual). Sera
      // remplace par item.obligationId au prochain refresh.
      if (!effectiveObligationId) setCreatedObligationId(result.obligationId);
      // Refresh : si TERMINE/NA, la ligne sortira de la liste cote engine ;
      // sinon le statut affiche sera reconfirme. Le useEffect ci-dessus
      // clear l'optimistic quand item.statutDetail/statut changent.
      startTransition(() => router.refresh());
    } catch (err) {
      // Revert l'optimistic en cas d'erreur serveur (ex. souscription
      // disparue, validation, etc.)
      console.error("setEcheanceStatus failed", err);
      setOptimistic(null);
    } finally {
      setPending(false);
    }
  }

  async function handleOpenComments(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = {
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
      right: rect.right,
    };
    const label = `${item.clientName}, ${item.trackerTitle}, ${item.periodeLabel}`;

    // Cas obligation virtuelle : on materialise la ligne DB avant d'ouvrir
    // le popover, pour pouvoir y attacher des commentaires. Idempotent.
    let oid = effectiveObligationId;
    if (!oid) {
      try {
        const result = await ensureObligationRow({
          clientId: item.clientId,
          type: item.type,
          periode: item.periode,
          annee: item.annee,
        });
        oid = result.obligationId;
        setCreatedObligationId(oid);
      } catch (err) {
        console.error("ensureObligationRow failed", err);
        return;
      }
    }
    onOpenComments({ obligationId: oid, label, anchor });
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
        {/* En mobile : statut picker + bouton commentaires + lien tracker a droite */}
        <div className="flex items-center gap-1 md:hidden shrink-0">
          <StatusPicker
            value={displayStatutDetail}
            statut={displayStatut}
            options={pickerOptions}
            onPick={handlePick}
            placeholder="À faire"
            disabled={pending || options.length === 0}
          />
          <CommentsButton count={commentCount} onClick={handleOpenComments} large />
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
              <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>|</span>{" "}clôture {item.clotureLabel}
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

      {/* Desktop : statut picker + commentaires + lien tracker.
          col-span-2 a droite. */}
      <div className="hidden md:flex md:col-span-2 items-center justify-end gap-1.5">
        <StatusPicker
          value={displayStatutDetail}
          statut={displayStatut}
          options={pickerOptions}
          onPick={handlePick}
          placeholder="À faire"
          disabled={pending || options.length === 0}
        />
        <CommentsButton count={commentCount} onClick={handleOpenComments} />
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
//  StatusPicker : wrapper du Picker avec resolution couleurs
// ============================================================================

function StatusPicker({
  value,
  statut,
  options,
  onPick,
  placeholder,
  disabled,
}: {
  value: string | null;
  /** Statut logique pour la couleur du chip - quand value=null ce sera
   *  toujours "A_FAIRE" (amber) puisque les obligations virtuelles sont
   *  par defaut a faire. */
  statut: SerializedEcheanceItem["statut"];
  options: Array<{ key: string; label: string; color: string; group?: string }>;
  onPick: (libelle: string | null) => void;
  placeholder: string;
  disabled: boolean;
}) {
  // Fallback : aucune option active pour ce type (config orphan).
  if (options.length === 0) {
    return (
      <span
        className={cn(
          "px-2 py-0.5 rounded text-[11px] font-medium border",
          statutColorClass(statut, null)
        )}
      >
        {value ?? placeholder}
      </span>
    );
  }

  // Si la valeur courante n'est plus dans la liste d'options (libelle
  // legacy desactive dans le parametrage), on l'injecte en tete pour
  // que la pastille s'affiche quand meme correctement.
  const augmented = [...options];
  if (value && !options.some((o) => o.key === value)) {
    augmented.unshift({
      key: value,
      label: value,
      color: statutColorClass(statut, null),
    });
  }

  // Couleur du chip quand value=null : on prend la couleur du statut
  // logique courant (A_FAIRE -> amber) au lieu du fallback transparent
  // du Picker. Comme ca le chip "À faire" reste lisible meme quand
  // l'obligation est virtuelle.
  const placeholderColor = statutColorClass(statut, null);

  return (
    <Picker
      value={value}
      options={augmented}
      onChange={(libelle) => onPick(libelle)}
      onReset={() => onPick(null)}
      resetLabel="Réinitialiser"
      allowEmpty
      placeholder={placeholder}
      placeholderTitle="Cliquer pour choisir un statut"
      placeholderColor={placeholderColor}
      align="right"
      size="sm"
      minWidth={200}
      disabled={disabled}
    />
  );
}

// ============================================================================
//  CommentsButton : bouton 💬 + badge count
// ============================================================================
//
// Memes commentaires que le tracker (la table obligation_comments est
// indexee sur obligation_id). count = 0 -> icone discrete grise.
// count > 0 -> icone + nombre avec accent jaune (style Notion).

function CommentsButton({
  count,
  onClick,
  large = false,
}: {
  count: number;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Mode mobile : touch-target plus large (w-9 h-9 au lieu de w-7 h-7). */
  large?: boolean;
}) {
  const dim = large ? "w-9 h-9" : "w-7 h-7";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md transition-colors",
        dim,
        count > 0
          ? "text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/15"
          : "text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] hover:text-zinc-700 dark:hover:text-zinc-200"
      )}
      title={
        count > 0
          ? `${count} commentaire${count > 1 ? "s" : ""}`
          : "Ajouter un commentaire"
      }
      aria-label={
        count > 0
          ? `${count} commentaire${count > 1 ? "s" : ""}`
          : "Ajouter un commentaire"
      }
    >
      <MessageSquare className={large ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {count > 0 && (
        <span className="text-[10px] font-medium tabular-nums leading-none">{count}</span>
      )}
    </button>
  );
}
