import Link from "next/link";
import { Lock, ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isClientBillable as clientIsBillable } from "@/lib/billable";
import { getTracker } from "../trackers";
import { countCommentsByObligation } from "../comments-actions";
import TrackerTable, { type StatusOption, type TrackerRow } from "./tracker-table";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;

export default async function ObligationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tracker: string }>;
  searchParams: Promise<{ year?: string; focus?: string }>;
}) {
  const { tracker: trackerSlug } = await params;
  const sp = await searchParams;
  const tracker = getTracker(trackerSlug);
  if (!tracker) notFound();
  const focus = sp.focus ?? null;

  const year = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;
  const cols = tracker.cols(year);
  const supabase = await createClient();

  // Perf : status_options ne dépend que de tracker.types (connu d'entrée).
  // On lance les 2 queries en parallèle au lieu de séquentiel → -1 RTT
  // transatlantique (~100ms en moins sur la page).
  const [{ data: subs }, { data: opts }] = await Promise.all([
    supabase
      .from("obligation_subscriptions")
      .select("client_id, type, clients!inner(id, slug, denomination, siren, pipeline_statut, origine)")
      .eq("annee", year)
      .eq("actif", true)
      .in("type", tracker.types),
    supabase
      .from("status_options")
      .select("type_code, libelle, statut_logique, ordre, color")
      .eq("scope", "obligation")
      .in("type_code", tracker.types)
      .eq("actif", true)
      .order("ordre"),
  ]);

  type SubRow = {
    client_id: string;
    type: string;
    clients: {
      id: string;
      slug: string;
      denomination: string;
      siren: string | null;
      pipeline_statut: string | null;
      origine: string | null;
    };
  };

  // 2. Dédoublonner + appliquer le filtre métier (signé / interne / sous-traitance)
  const clientsMap = new Map<string, SubRow["clients"]>();
  for (const s of (subs ?? []) as unknown as SubRow[]) {
    if (!clientsMap.has(s.client_id) && clientIsBillable(s.clients)) {
      clientsMap.set(s.client_id, s.clients);
    }
  }
  const clientIds = [...clientsMap.keys()];

  // 3. Obligations pour ces clients × types × année (uniquement subs actives)
  let obligations: Array<{
    id: string;
    client_id: string;
    type: string;
    periode: string;
    echeance: string | null;
    statut_logique: string;
    statut_detail: string | null;
    note: string | null;
    etat_facturation: string | null;
  }> = [];

  if (clientIds.length > 0) {
    // Try with etat_facturation. If migration 0050 pas encore appliquee,
    // on retombe sur la query sans la colonne.
    const { data, error } = await supabase
      .from("obligations")
      .select("id, client_id, type, periode, echeance, statut_logique, statut_detail, note, etat_facturation, obligation_subscriptions!inner(actif)")
      .in("client_id", clientIds)
      .in("type", tracker.types)
      .eq("annee", year)
      .eq("obligation_subscriptions.actif", true);
    if (error) {
      const { data: fallback } = await supabase
        .from("obligations")
        .select("id, client_id, type, periode, echeance, statut_logique, statut_detail, note, obligation_subscriptions!inner(actif)")
        .in("client_id", clientIds)
        .in("type", tracker.types)
        .eq("annee", year)
        .eq("obligation_subscriptions.actif", true);
      obligations = (fallback ?? []).map((o) => ({ ...o, etat_facturation: null }));
    } else {
      obligations = data ?? [];
    }
  }

  // 4. (status_options déjà chargé en parallèle de subs ci-dessus)
  const statusOptions: Record<string, StatusOption[]> = {};
  for (const o of opts ?? []) {
    if (!statusOptions[o.type_code]) statusOptions[o.type_code] = [];
    statusOptions[o.type_code].push({
      libelle: o.libelle,
      statut_logique: o.statut_logique as StatusOption["statut_logique"],
      color: o.color ?? null,
    });
  }

  // 5. Pivot
  const oblByKey = new Map<string, (typeof obligations)[number]>();
  for (const o of obligations) {
    oblByKey.set(`${o.client_id}|${o.type}|${o.periode}`, o);
  }

  const clientsSorted = [...clientsMap.values()].sort((a, b) =>
    a.denomination.localeCompare(b.denomination, "fr")
  );

  // Counts de commentaires pour les indicateurs 💬 dans les cellules
  const allObligationIds = obligations.map((o) => o.id);
  const [commentCounts, { data: { user } }] = await Promise.all([
    countCommentsByObligation(allObligationIds),
    supabase.auth.getUser(),
  ]);
  const currentUserEmail = user?.email ?? null;

  const rows: TrackerRow[] = clientsSorted.map((c) => ({
    clientId: c.id,
    clientSlug: c.slug,
    denomination: c.denomination,
    siren: c.siren,
    pipeline: c.pipeline_statut,
    origine: c.origine,
    cells: cols.map((col) => {
      const o = oblByKey.get(`${c.id}|${col.type}|${col.periode}`);
      return o
        ? {
            colKey: col.key,
            obligationId: o.id,
            type: col.type,
            statut_logique: o.statut_logique as "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE",
            statut_detail: o.statut_detail,
            echeance: o.echeance,
            note: o.note,
            etat_facturation: o.etat_facturation as "a_facturer" | "facturee" | "payee" | "sans_facture" | null,
          }
        : {
            colKey: col.key,
            obligationId: null,
            type: col.type,
            statut_logique: null,
            statut_detail: null,
            echeance: null,
            note: null,
            etat_facturation: null,
          };
    }),
  }));

  return (
    <div className="space-y-5">
      <Link
        href={`/obligations?year=${year}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors group"
      >
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-zinc-200 bg-white group-hover:border-zinc-300 group-hover:shadow-card transition-all">
          <ChevronLeft className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium">Sommaire production</span>
      </Link>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">{tracker.title}</h1>
          {tracker.description && (
            <p className="text-sm text-zinc-500 mt-1">{tracker.description}</p>
          )}
        </div>
        <YearSelector slug={trackerSlug} year={year} />
      </div>

      <TrackerTable
        rows={rows}
        cols={cols}
        statusOptions={statusOptions}
        focus={focus}
        initialCommentCounts={commentCounts}
        currentUserEmail={currentUserEmail}
      />
    </div>
  );
}

function YearSelector({ slug, year }: { slug: string; year: number }) {
  const years = [year - 1, year, year + 1];
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
        {years.map((y) => (
          <Link
            key={y}
            href={`/obligations/${slug}?year=${y}`}
            className={
              y === year
                ? "px-3 py-1 rounded-lg text-sm bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-semibold tabular-nums"
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
