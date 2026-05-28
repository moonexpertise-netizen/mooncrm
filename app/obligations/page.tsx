import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import { PageHeader } from "@/app/_components/page-header";
import { TRACKERS, slugForType } from "./trackers";
import SommaireCards, { type TrackerStat } from "./sommaire-cards";

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

  // On lit toutes les obligations de l'année avec sub active + clients facturables
  const { data: rows } = await supabase
    .from("obligations")
    .select(
      "type, statut_logique, echeance, updated_at, obligation_subscriptions!inner(actif), clients!inner(pipeline_statut, origine)",
    )
    .eq("annee", selectedYear)
    .eq("obligation_subscriptions.actif", true);

  type Row = {
    type: string;
    statut_logique: string;
    echeance: string | null;
    updated_at: string | null;
    clients: { pipeline_statut: string | null; origine: string | null };
  };

  // Agrégation par slug de tracker
  type Agg = {
    todo: number;
    wip: number;
    done: number;
    total: number;
    prochaineEcheance: string | null; // min des échéances non terminées et >= today
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
      derniereAction: null,
    });
  }

  for (const r of (rows ?? []) as unknown as Row[]) {
    const c = r.clients;
    if (!isClientBillable(c)) continue;

    const slug = slugForType(r.type);
    if (!slug) continue;
    const agg = bySlug.get(slug);
    if (!agg) continue;

    agg.total++;
    const isDone =
      r.statut_logique === "TERMINE" || r.statut_logique === "NON_APPLICABLE";
    const isWip = r.statut_logique === "EN_COURS";
    if (isDone) agg.done++;
    else if (isWip) agg.wip++;
    else agg.todo++;

    // Prochaine échéance : la plus proche échéance non terminée à venir
    if (!isDone && r.echeance && r.echeance >= today) {
      if (!agg.prochaineEcheance || r.echeance < agg.prochaineEcheance) {
        agg.prochaineEcheance = r.echeance;
      }
    }

    // Dernière action : max updated_at
    if (r.updated_at) {
      if (!agg.derniereAction || r.updated_at > agg.derniereAction) {
        agg.derniereAction = r.updated_at;
      }
    }
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
