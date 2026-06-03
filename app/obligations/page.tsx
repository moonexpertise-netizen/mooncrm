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

  // 1) Obligations materialisees pour l'annee selectionnee
  // 2) Subscriptions actives pour deduire les obligations "virtuelles"
  //    (cellules placeholder "À traiter" cote tracker mais aucune ligne en DB)
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
      derniereAction: null,
    });
  }

  // Buckets de charge a venir : agreges sur toutes les obligations non
  // terminees, scopes au filtre Production (LDM/Interne/ST). Permet de
  // visualiser la "vague" qui arrive sans avoir a deduire des compteurs
  // tracker par tracker.
  const charge = {
    enRetard: 0,        // echeance < today
    cetteSemaine: 0,    // 0-7 jours
    ceMois: 0,          // 8-30 jours
    moisProchain: 0,    // 31-60 jours
    deuxMois: 0,        // 61-90 jours
    plusTard: 0,        // > 90 jours
  };
  const sevenDaysIso = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().substring(0, 10); })();
  const thirtyDaysIso = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().substring(0, 10); })();
  const sixtyDaysIso = (() => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().substring(0, 10); })();
  const ninetyDaysIso = (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().substring(0, 10); })();

  // Index des obligations materialisees pour deduplication des virtuelles
  const materializedSommaire = new Set<string>();
  for (const r of (rows ?? []) as unknown as Row[]) {
    materializedSommaire.add(`${r.client_id}|${r.type}|${r.annee}`);
  }

  function ingest(opts: {
    slug: string;
    isDone: boolean;
    isWip: boolean;
    dueDateStr: string | null;
    updatedAt: string | null;
  }) {
    const agg = bySlug.get(opts.slug);
    if (!agg) return;
    agg.total++;
    if (opts.isDone) agg.done++;
    else if (opts.isWip) agg.wip++;
    else agg.todo++;

    if (!opts.isDone && opts.dueDateStr && opts.dueDateStr >= today) {
      if (!agg.prochaineEcheance || opts.dueDateStr < agg.prochaineEcheance) {
        agg.prochaineEcheance = opts.dueDateStr;
      }
    }
    if (!opts.isDone && opts.dueDateStr && opts.dueDateStr < today) {
      agg.enRetard++;
      charge.enRetard++;
    } else if (!opts.isDone && opts.dueDateStr) {
      if (opts.dueDateStr <= sevenDaysIso) charge.cetteSemaine++;
      else if (opts.dueDateStr <= thirtyDaysIso) charge.ceMois++;
      else if (opts.dueDateStr <= sixtyDaysIso) charge.moisProchain++;
      else if (opts.dueDateStr <= ninetyDaysIso) charge.deuxMois++;
      else charge.plusTard++;
    }
    if (opts.updatedAt) {
      if (!agg.derniereAction || opts.updatedAt > agg.derniereAction) {
        agg.derniereAction = opts.updatedAt;
      }
    }
  }

  // 1) Pass : obligations materialisees
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

    ingest({ slug, isDone, isWip, dueDateStr, updatedAt: r.updated_at });
  }

  // 2) Pass : obligations virtuelles (subscription active sans materialisation)
  function periodesAttenduesSommaire(type: string, annee: number): string[] {
    const tracker = TRACKERS.find((t) => t.types.includes(type));
    if (!tracker) return [];
    return tracker.cols(annee).filter((col) => col.type === type).map((col) => col.periode);
  }
  const seenSommaireVirtual = new Set<string>();
  for (const s of (subs ?? []) as unknown as SubRow[]) {
    const c = s.clients;
    if (!isClientBillable(c)) continue;
    if (materializedSommaire.has(`${s.client_id}|${s.type}|${s.annee}`)) continue;

    const slug = slugForType(s.type);
    if (!slug) continue;

    const cloture = (c.jour_cloture && c.mois_cloture)
      ? { jour: c.jour_cloture, mois: c.mois_cloture }
      : { jour: 31, mois: 12 };

    const periodes = periodesAttenduesSommaire(s.type, s.annee);
    for (const periode of periodes) {
      const key = `${s.client_id}|${s.type}|${s.annee}|${periode}`;
      if (seenSommaireVirtual.has(key)) continue;
      seenSommaireVirtual.add(key);
      const ech = computeEcheance(s.type, periode, s.annee, cloture);
      const dueDateStr = ech ? ech.dueDate.toISOString().substring(0, 10) : null;
      ingest({ slug, isDone: false, isWip: false, dueDateStr, updatedAt: null });
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

      <SommaireCards rows={stats} year={selectedYear} charge={charge} />
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
