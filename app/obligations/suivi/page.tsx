import Link from "next/link";
import { Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRACKERS, getTracker } from "../trackers";
import TrackerTable, { type StatusOption, type TrackerRow } from "./tracker-table";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;
const DEFAULT_SLUG = TRACKERS[0].slug;

// Filtre métier : ne sont retenus dans les trackers que les dossiers qui sont
// soit signés (6 - LDM Signée), soit internes (Z - Interne), soit en
// sous-traitance (origine Z - Sous-traitance).
const PIPELINE_OK = new Set(["7 - LDM signée", "Z - Interne"]);
const ORIGINE_OK = new Set(["Z - Sous-traitance"]);

function clientIsBillable(c: { pipeline_statut: string | null; origine: string | null }): boolean {
  if (c.pipeline_statut && PIPELINE_OK.has(c.pipeline_statut)) return true;
  if (c.origine && ORIGINE_OK.has(c.origine)) return true;
  return false;
}

export default async function ObligationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; year?: string; focus?: string }>;
}) {
  const sp = await searchParams;
  const slug = sp.type ?? DEFAULT_SLUG;
  const tracker = getTracker(slug);
  if (!tracker) notFound();
  const focus = sp.focus ?? null;

  const year = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;
  const cols = tracker.cols(year);
  const supabase = await createClient();

  // 1. Tous les subs actifs pour ce tracker × cette année, joint sur clients
  const { data: subs } = await supabase
    .from("obligation_subscriptions")
    .select("client_id, type, clients!inner(id, denomination, siren, pipeline_statut, origine)")
    .eq("annee", year)
    .eq("actif", true)
    .in("type", tracker.types);

  type SubRow = {
    client_id: string;
    type: string;
    clients: {
      id: string;
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

  // 4. Status options pour les types du tracker
  const { data: opts } = await supabase
    .from("status_options")
    .select("type_code, libelle, statut_logique, ordre, color")
    .eq("scope", "obligation")
    .in("type_code", tracker.types)
    .eq("actif", true)
    .order("ordre");

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

  const rows: TrackerRow[] = clientsSorted.map((c) => ({
    clientId: c.id,
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
        <YearSelector slug={slug} year={year} />
      </div>

      <TrackerTable rows={rows} cols={cols} statusOptions={statusOptions} focus={focus} />
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
            href={`/obligations/suivi?type=${slug}&year=${y}`}
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
