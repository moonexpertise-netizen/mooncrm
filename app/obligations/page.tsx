import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import { PageHeader } from "@/app/_components/page-header";
import { TRACKERS, slugForType } from "./trackers";
import SommaireCards, { type TrackerStat } from "./sommaire-cards";
import { computeEcheance } from "@/lib/echeances";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;
// Fenetre glissante : 4 annees avant + courante + 1 apres. Permet a Benjamin
// de remonter sur les exercices passes (ex. clotures decalees, repreneurs
// d'exercice incomplet) sans avoir a modifier le code a chaque rentree.
const AVAILABLE_YEARS = [
  CURRENT_YEAR - 4,
  CURRENT_YEAR - 3,
  CURRENT_YEAR - 2,
  CURRENT_YEAR - 1,
  CURRENT_YEAR,
  CURRENT_YEAR + 1,
];

export default async function ObligationsSommaire({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const yearParam = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;
  const selectedYear = AVAILABLE_YEARS.includes(yearParam)
    ? yearParam
    : CURRENT_YEAR;

  const supabase = await createClient();
  const today = new Date().toISOString().substring(0, 10);

  // On ne compte QUE les obligations qui existent reellement en DB. Pas de
  // "virtuelles" deduites des subscriptions : ca produisait des chiffres
  // faux (ex. 199 TVA mensuelles janvier 2025 toutes "464j en retard" pour
  // des cellules jamais materialisees). Si une cellule n'est pas en DB,
  // elle n'apparait pas dans les compteurs - on ne ment pas.
  //
  // Fenetre annee elargie [N-1, N+1] : les obligations annuelles (AGO,
  // BILAN, DAS2, IS_SOLDE) ont en DB `annee = exercice clos` mais leur
  // echeance tombe en N+1. Ex : OUI SPORTS clo 31/12/2025 -> obligation
  // annee=2025, echeance 30/06/2026. Sans fenetre elargie, l'echeance
  // 30/06/2026 etait invisible dans le suivi 2026. On filtre ensuite
  // dans ingest : todo/wip/done/total restent scopes a l'annee selectionnee,
  // mais aTraiter/enRetard couvrent tout ce qui demande action MAINTENANT,
  // peu importe l'annee fiscale.
  const { data: rows } = await supabase
    .from("obligations")
    .select(
      "client_id, type, periode, annee, statut_logique, echeance, updated_at, obligation_subscriptions!inner(actif), clients!inner(pipeline_statut, origine, jour_cloture, mois_cloture)",
    )
    .gte("annee", selectedYear - 1)
    .lte("annee", selectedYear + 1)
    .eq("obligation_subscriptions.actif", true);

  type Row = {
    client_id: string;
    type: string;
    periode: string;
    annee: number;
    statut_logique: string;
    echeance: string | null;
    updated_at: string | null;
    clients: {
      pipeline_statut: string | null;
      origine: string | null;
      jour_cloture: number | null;
      mois_cloture: number | null;
    };
  };

  // Agrégation par slug de tracker
  type Agg = {
    todo: number;
    wip: number;
    done: number;
    total: number;
    prochaineEcheance: string | null; // min des échéances non terminées et >= today
    enRetard: number; // nb d'obligations dont l'échéance est dépassée et pas terminées
    aTraiter: number; // echeance ≤ 30j ou depassee, non terminee
    /** Set des periodes brutes qui contribuent a aTraiter, pour traçabilite. */
    aTraiterPeriodes: Set<string>;
    derniereAction: string | null; // max updated_at
  };
  const bySlug = new Map<string, Agg>();
  // Initialise chaque tracker pour qu'ils apparaissent tous, même à 0
  for (const t of TRACKERS) {
    bySlug.set(t.slug, {
      todo: 0,
      wip: 0,
      done: 0,
      total: 0,
      prochaineEcheance: null,
      enRetard: 0,
      aTraiter: 0,
      aTraiterPeriodes: new Set<string>(),
      derniereAction: null,
    });
  }
  // Borne haute "echeance proche" : 30 jours a partir d'aujourd'hui
  const thirtyDaysIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().substring(0, 10);
  })();

  function ingest(opts: {
    slug: string;
    annee: number;
    periode: string;
    isDone: boolean;
    isWip: boolean;
    dueDateStr: string | null;
    updatedAt: string | null;
  }) {
    const agg = bySlug.get(opts.slug);
    if (!agg) return;
    // Compteurs todo/wip/done/total : scopes a l'annee selectionnee (sinon
    // un AGO de l'exercice 2024 termine en 2025 polluerait le compteur 2026).
    if (opts.annee === selectedYear) {
      agg.total++;
      if (opts.isDone) agg.done++;
      else if (opts.isWip) agg.wip++;
      else agg.todo++;
    }
    // aTraiter / enRetard / prochaineEcheance : couvrent TOUTES les
    // obligations non terminees de la fenetre [N-1, N+1] qui demandent
    // action maintenant. C'est ca le pilotage : peu importe l'annee
    // fiscale, on doit voir tout ce qui arrive a echeance.
    if (!opts.isDone && opts.dueDateStr && opts.dueDateStr >= today) {
      if (!agg.prochaineEcheance || opts.dueDateStr < agg.prochaineEcheance) {
        agg.prochaineEcheance = opts.dueDateStr;
      }
    }
    if (!opts.isDone && opts.dueDateStr && opts.dueDateStr < today) {
      agg.enRetard++;
      agg.aTraiter++;
      agg.aTraiterPeriodes.add(opts.periode);
    } else if (!opts.isDone && opts.dueDateStr && opts.dueDateStr <= thirtyDaysIso) {
      // Echeance proche (≤ 30j) -> a traiter prioritaire
      agg.aTraiter++;
      agg.aTraiterPeriodes.add(opts.periode);
    }
    if (opts.updatedAt && opts.annee === selectedYear) {
      if (!agg.derniereAction || opts.updatedAt > agg.derniereAction) {
        agg.derniereAction = opts.updatedAt;
      }
    }
  }

  // Pass unique : obligations REELLEMENT en DB
  for (const r of (rows ?? []) as unknown as Row[]) {
    const c = r.clients;
    if (!isClientBillable(c)) continue;

    const slug = slugForType(r.type);
    if (!slug) continue;

    const isDone =
      r.statut_logique === "TERMINE" || r.statut_logique === "NON_APPLICABLE";
    const isWip = r.statut_logique === "EN_COURS";

    const cloture = (r.clients.jour_cloture && r.clients.mois_cloture)
      ? { jour: r.clients.jour_cloture, mois: r.clients.mois_cloture }
      : { jour: 31, mois: 12 };
    const ech = computeEcheance(r.type, r.periode, r.annee, cloture);
    const dueDateStr = ech ? ech.dueDate.toISOString().substring(0, 10) : null;

    ingest({ slug, annee: r.annee, periode: r.periode, isDone, isWip, dueDateStr, updatedAt: r.updated_at });
  }

  const stats: TrackerStat[] = TRACKERS.map((t) => {
    const a = bySlug.get(t.slug)!;
    return {
      slug: t.slug,
      title: t.title,
      description: t.description,
      group: t.group,
      todo: a.todo,
      wip: a.wip,
      done: a.done,
      total: a.total,
      prochaineEcheance: a.prochaineEcheance,
      enRetard: a.enRetard,
      aTraiter: a.aTraiter,
      // Liste des periodes (uniques) qui composent aTraiter, pour tracabilite.
      // Ex: ["2026-06"] sur IS acomptes signifie "on compte que juin".
      aTraiterPeriodes: Array.from(a.aTraiterPeriodes).sort(),
      derniereAction: a.derniereAction,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suivi de production"
        description={`Exercice ${selectedYear} · dossiers signés / internes / sous-traitance.`}
        actions={<YearSelector year={selectedYear} />}
      />

      <SommaireCards rows={stats} year={selectedYear} />
    </div>
  );
}

function YearSelector({ year }: { year: number }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400"
        title="L'année reste active pendant ta navigation entre les sous-trackers Production"
      >
        <Lock className="h-2.5 w-2.5" />
        <span>Mémorisée</span>
      </div>
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
        {AVAILABLE_YEARS.map((y) => (
          <Link
            key={y}
            href={`/obligations?year=${y}`}
            className={
              y === year
                ? // Annee active : cadre marque + fond + ombre, tres lisible
                  "px-3 py-1 rounded-lg text-sm bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold tabular-nums"
                : "px-3 py-1 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/50 dark:hover:bg-white/[0.06] tabular-nums border border-transparent"
            }
          >
            {y}
          </Link>
        ))}
      </div>
    </div>
  );
}
