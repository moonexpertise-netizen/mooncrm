import Link from "next/link";
import { Lock } from "lucide-react";
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
  }> = [];

  if (clientIds.length > 0) {
    const { data } = await supabase
      .from("obligations")
      .select("id, client_id, type, periode, echeance, statut_logique, statut_detail, note, obligation_subscriptions!inner(actif)")
      .in("client_id", clientIds)
      .in("type", tracker.types)
      .eq("annee", year)
      .eq("obligation_subscriptions.actif", true);
    obligations = data ?? [];
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
          }
        : {
            colKey: col.key,
            obligationId: null,
            type: col.type,
            statut_logique: null,
            statut_detail: null,
            echeance: null,
            note: null,
          };
    }),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-baseline gap-3">
          <Link
            href={`/obligations?year=${year}`}
            className="text-sm text-muted-foreground hover:text-[hsl(var(--gold))] transition-colors"
          >
            ← Sommaire
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{tracker.title}</h1>
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
    <div className="flex flex-col items-end gap-1">
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500"
        title="L'année reste active pendant ta navigation entre les sous-trackers Production"
      >
        <Lock className="h-2.5 w-2.5" />
        <span>Mémorisée</span>
      </div>
      <div className="flex gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/obligations/${slug}?year=${y}`}
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
