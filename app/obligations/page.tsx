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

  // On charge :
  //   1) les obligations EN DB pour la stat brute (todo/wip/done/total)
  //   2) les subscriptions actives pour deduire les cellules ATTENDUES
  //      du tracker (= la grille). Le compteur "a traiter" est ensuite
  //      calcule en parcourant les cellules attendues : pour chaque
  //      (client x type x periode) dont l'echeance est ≤ 30j ou
  //      depassee, on regarde si l'obligation DB est TERMINE/NA :
  //        - oui    -> deja fait, ne compte pas
  //        - non    -> a traiter
  //        - absente -> a traiter (cellule placeholder dans le tracker)
  //   Resultat : meme decompte que la grille du tracker, traçable,
  //   et zombies legacy au mauvais format de periode sont ignores (le
  //   tracker ne les voit pas non plus, ils ne polluent plus).
  const [{ data: rows }, { data: subs }] = await Promise.all([
    supabase
      .from("obligations")
      .select(
        "client_id, type, periode, annee, statut_logique, echeance, updated_at, obligation_subscriptions!inner(actif), clients!inner(pipeline_statut, origine, jour_cloture, mois_cloture)",
      )
      .eq("annee", selectedYear)
      .eq("obligation_subscriptions.actif", true),
    supabase
      .from("obligation_subscriptions")
      .select(
        "client_id, type, annee, clients!inner(pipeline_statut, origine, jour_cloture, mois_cloture)",
      )
      .eq("annee", selectedYear)
      .eq("actif", true),
  ]);

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
  type SubRow = {
    client_id: string;
    type: string;
    annee: number;
    clients: Row["clients"];
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

  // ============================================================================
  //  Pass 1 : stats brutes sur les obligations qui existent en DB
  //           (todo/wip/done/total/prochaineEcheance/derniereAction)
  // ============================================================================
  for (const r of (rows ?? []) as unknown as Row[]) {
    const c = r.clients;
    if (!isClientBillable(c)) continue;

    const slug = slugForType(r.type);
    if (!slug) continue;
    const agg = bySlug.get(slug);
    if (!agg) continue;

    const isDone =
      r.statut_logique === "TERMINE" || r.statut_logique === "NON_APPLICABLE";
    const isWip = r.statut_logique === "EN_COURS";

    agg.total++;
    if (isDone) agg.done++;
    else if (isWip) agg.wip++;
    else agg.todo++;

    const cloture = (r.clients.jour_cloture && r.clients.mois_cloture)
      ? { jour: r.clients.jour_cloture, mois: r.clients.mois_cloture }
      : { jour: 31, mois: 12 };
    const ech = computeEcheance(r.type, r.periode, r.annee, cloture);
    const dueDateStr = ech ? ech.dueDate.toISOString().substring(0, 10) : null;

    if (!isDone && dueDateStr && dueDateStr >= today) {
      if (!agg.prochaineEcheance || dueDateStr < agg.prochaineEcheance) {
        agg.prochaineEcheance = dueDateStr;
      }
    }
    if (r.updated_at) {
      if (!agg.derniereAction || r.updated_at > agg.derniereAction) {
        agg.derniereAction = r.updated_at;
      }
    }
  }

  // ============================================================================
  //  Pass 2 : calcul de aTraiter / enRetard via subscriptions x periodes
  //           attendues du tracker. Source de verite = la grille du tracker.
  // ============================================================================
  //
  // Pour chaque (client x type) abonne :
  //   1) On enumere les periodes attendues (= colonnes du tracker)
  //   2) Pour chaque periode dont l'echeance est ≤ 30j ou depassee :
  //        - Si une obligation DB existe ET est TERMINE/NA -> deja fait
  //        - Sinon (placeholder OU A_FAIRE OU EN_COURS) -> a traiter
  //
  // Avantage : meme decompte que ce que tu vois dans le tracker (les
  // placeholders comptent comme "a faire"), et les obligations zombies
  // au mauvais format de periode ne polluent plus.
  const obligationsByKey = new Map<string, Row>();
  for (const r of (rows ?? []) as unknown as Row[]) {
    obligationsByKey.set(`${r.client_id}|${r.type}|${r.periode}`, r);
  }
  function periodesAttenduesParTracker(type: string, annee: number, slug: string): string[] {
    const tracker = TRACKERS.find((t) => t.slug === slug);
    if (!tracker) return [];
    // On filtre par type (un meme tracker peut avoir plusieurs types) et
    // on ignore les colonnes "facturation" (rendu seulement, pas de cellule
    // d'obligation distincte cote DB).
    return tracker
      .cols(annee)
      .filter((col) => col.type === type && col.kind !== "facturation")
      .map((col) => col.periode);
  }
  const seenATraiter = new Set<string>();
  for (const s of (subs ?? []) as unknown as SubRow[]) {
    const c = s.clients;
    if (!isClientBillable(c)) continue;
    const slug = slugForType(s.type);
    if (!slug) continue;
    const agg = bySlug.get(slug);
    if (!agg) continue;

    const cloture = (c.jour_cloture && c.mois_cloture)
      ? { jour: c.jour_cloture, mois: c.mois_cloture }
      : { jour: 31, mois: 12 };

    const periodes = periodesAttenduesParTracker(s.type, s.annee, slug);
    for (const periode of periodes) {
      const cellKey = `${s.client_id}|${s.type}|${periode}`;
      if (seenATraiter.has(cellKey)) continue;
      seenATraiter.add(cellKey);

      const ech = computeEcheance(s.type, periode, s.annee, cloture);
      if (!ech) continue;
      const dueIso = ech.dueDate.toISOString().substring(0, 10);
      // On ne compte QUE les echeances proches (≤ 30j) ou deja depassees.
      if (dueIso > thirtyDaysIso) continue;

      // Cellule existe-t-elle en DB ?
      const obl = obligationsByKey.get(cellKey);
      if (obl) {
        const isDone =
          obl.statut_logique === "TERMINE" ||
          obl.statut_logique === "NON_APPLICABLE";
        if (isDone) continue; // deja fait
      }
      // Placeholder OU obligation A_FAIRE/EN_COURS -> a traiter
      agg.aTraiter++;
      agg.aTraiterPeriodes.add(periode);
      if (dueIso < today) agg.enRetard++;
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
