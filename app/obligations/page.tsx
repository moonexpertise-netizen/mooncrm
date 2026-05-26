import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import { TRACKERS, slugForType } from "./trackers";
import SommaireCards, { type TrackerStat } from "./sommaire-cards";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;
const AVAILABLE_YEARS = [2024, 2025, 2026];

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
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Suivi de production
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Exercice {selectedYear} · dossiers signés / internes /
            sous-traitance.
          </p>
        </div>
        <YearSelector year={selectedYear} />
      </div>

      <SommaireCards rows={stats} year={selectedYear} />
    </div>
  );
}

function YearSelector({ year }: { year: number }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500"
        title="L'année reste active pendant ta navigation entre les sous-trackers Production"
      >
        <Lock className="h-2.5 w-2.5" />
        <span>Mémorisée</span>
      </div>
      <div className="flex gap-2">
        {AVAILABLE_YEARS.map((y) => (
          <Link
            key={y}
            href={`/obligations?year=${y}`}
            className={
              y === year
                ? "px-3 py-1 rounded-md text-sm border bg-[hsl(var(--gold))] text-white border-[hsl(var(--gold))] shadow-sm"
                : "px-3 py-1 rounded-md text-sm border bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400"
            }
          >
            {y}
          </Link>
        ))}
      </div>
    </div>
  );
}
