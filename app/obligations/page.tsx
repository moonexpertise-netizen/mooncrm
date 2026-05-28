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

  // On lit toutes les obligations de l'annee + le slug et denomination du
  // client (pour le popover de detail au survol). Sub active et client
  // billable filtres ensuite cote JS.
  const { data: rows } = await supabase
    .from("obligations")
    .select(
      "type, statut_logique, statut_detail, echeance, updated_at, obligation_subscriptions!inner(actif), clients!inner(slug, denomination, pipeline_statut, origine)",
    )
    .eq("annee", selectedYear)
    .eq("obligation_subscriptions.actif", true);

  type Row = {
    type: string;
    statut_logique: string;
    statut_detail: string | null;
    echeance: string | null;
    updated_at: string | null;
    clients: {
      slug: string;
      denomination: string;
      pipeline_statut: string | null;
      origine: string | null;
    };
  };

  // Agregation par slug de tracker. On garde les listes de clients par
  // statut pour le popover de detail au survol.
  type Agg = {
    todo: number;
    wip: number;
    done: number;
    total: number;
    prochaineEcheance: string | null;
    derniereAction: string | null;
    todoClients: ClientLite[];
    wipClients: ClientLite[];
    doneClients: ClientLite[];
  };
  type ClientLite = {
    slug: string;
    denomination: string;
    echeance: string | null;
    statut_detail: string | null;
  };

  const bySlug = new Map<string, Agg>();
  // Initialise chaque tracker pour qu'ils apparaissent tous, meme a 0
  for (const t of TRACKERS) {
    bySlug.set(t.slug, {
      todo: 0,
      wip: 0,
      done: 0,
      total: 0,
      prochaineEcheance: null,
      derniereAction: null,
      todoClients: [],
      wipClients: [],
      doneClients: [],
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

    const clientLite: ClientLite = {
      slug: c.slug,
      denomination: c.denomination,
      echeance: r.echeance,
      statut_detail: r.statut_detail,
    };

    if (isDone) {
      agg.done++;
      agg.doneClients.push(clientLite);
    } else if (isWip) {
      agg.wip++;
      agg.wipClients.push(clientLite);
    } else {
      agg.todo++;
      agg.todoClients.push(clientLite);
    }

    // Prochaine echeance : la plus proche echeance non terminee a venir
    if (!isDone && r.echeance && r.echeance >= today) {
      if (!agg.prochaineEcheance || r.echeance < agg.prochaineEcheance) {
        agg.prochaineEcheance = r.echeance;
      }
    }

    // Derniere action : max updated_at
    if (r.updated_at) {
      if (!agg.derniereAction || r.updated_at > agg.derniereAction) {
        agg.derniereAction = r.updated_at;
      }
    }
  }

  // Tri des listes de clients : par echeance croissante (les plus urgents en
  // tete) puis par denomination. Limite a 20 par liste pour ne pas surcharger
  // le popover ni le serialiseur Server Components.
  function sortClients(list: ClientLite[]): ClientLite[] {
    return list
      .sort((a, b) => {
        if (a.echeance && b.echeance) return a.echeance.localeCompare(b.echeance);
        if (a.echeance) return -1;
        if (b.echeance) return 1;
        return a.denomination.localeCompare(b.denomination, "fr");
      })
      .slice(0, 20);
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
      todoClients: sortClients(a.todoClients),
      wipClients: sortClients(a.wipClients),
      doneClients: sortClients(a.doneClients),
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
