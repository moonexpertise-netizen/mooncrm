import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import PilotageTable, { type PilotageRow, type PilotageCell } from "./pilotage-table";
import { isClientBillable } from "@/lib/billable";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;

/**
 * Page "Pilotage / Dashboard" : suivi TdB livraison + RDV Expert.
 *
 * Architecture :
 *   - Table pilotage_obligations (cf. migration 0062), isolee de la table
 *     obligations principale (pas d'enum partage).
 *   - Cadences (Mensuelle/Trimestrielle) sur clients.tdb_livraison_periode
 *     et rdv_expert_periode.
 *
 * Pattern : similar a /missions/ir et /missions/caa.
 */
export default async function PilotagePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const year = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;
  const type = (sp.type === "RDV" ? "RDV" : "TDB") as "TDB" | "RDV";

  const sb = await createClient();

  // 1. Toutes les pilotage_obligations pour l'année selectionnée + type
  const { data: oblig } = await sb
    .from("pilotage_obligations")
    .select("id, client_id, periode, statut_logique, statut_detail")
    .eq("annee", year)
    .eq("type", type);
  type Ob = {
    id: string;
    client_id: string;
    periode: string;
    statut_logique: string;
    statut_detail: string | null;
  };
  const subscribedClientIds = [...new Set((oblig ?? []).map((o) => (o as Ob).client_id))];

  // 2. Charger uniquement les clients souscrits (= ayant au moins 1 oblig
  //    pilotage pour cette annee/type). On ne montre PAS les autres : la
  //    souscription se fait via la fiche client > Obligations.
  if (subscribedClientIds.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pilotage · Dashboard"
          description="Suivi de la mise à disposition du tableau de bord et des rendez-vous expert · cadence configurable par client."
        />
        <PilotageTable rows={[]} year={year} type={type} />
      </div>
    );
  }

  const { data: clientsRaw } = await sb
    .from("clients")
    .select("id, slug, denomination, siren, pipeline_statut, origine, tdb_livraison_periode, rdv_expert_periode")
    .in("id", subscribedClientIds)
    .order("denomination");
  const clients = (clientsRaw ?? []).filter(isClientBillable) as Array<{
    id: string;
    slug: string;
    denomination: string;
    siren: string | null;
    pipeline_statut: string | null;
    origine: string | null;
    tdb_livraison_periode: string | null;
    rdv_expert_periode: string | null;
  }>;

  // 2b. Cadences par (client, annee) depuis client_year_config (cf. 0063)
  //     Fallback sur clients.tdb_livraison_periode / rdv_expert_periode si
  //     pas de config pour cette annee (back-compat avec ancien stockage).
  const { data: ycRaw } = await sb
    .from("client_year_config")
    .select("client_id, annee, tdb_livraison_periode, rdv_expert_periode")
    .in("client_id", subscribedClientIds)
    .eq("annee", year);
  const cadenceByClient = new Map<string, string | null>();
  for (const yc of (ycRaw ?? []) as Array<{
    client_id: string;
    annee: number;
    tdb_livraison_periode: string | null;
    rdv_expert_periode: string | null;
  }>) {
    cadenceByClient.set(
      yc.client_id,
      type === "TDB" ? yc.tdb_livraison_periode : yc.rdv_expert_periode
    );
  }

  // 3. Pivot : 1 row par client, dans une Map cells[periode] = ...
  const rows: PilotageRow[] = clients.map((c) => {
    const cadenceAnnuelle = cadenceByClient.get(c.id) ?? null;
    const fallback = type === "TDB" ? c.tdb_livraison_periode : c.rdv_expert_periode;
    const cadence = cadenceAnnuelle ?? fallback;
    const cells = new Map<string, PilotageCell>();
    for (const o of (oblig ?? []) as Ob[]) {
      if (o.client_id !== c.id) continue;
      cells.set(o.periode, {
        id: o.id,
        statut_logique: o.statut_logique as PilotageCell["statut_logique"],
        statut_detail: o.statut_detail,
      });
    }
    return {
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      siren: c.siren,
      cadence: cadence as PilotageRow["cadence"],
      cells,
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pilotage · Dashboard"
        description="Suivi de la mise à disposition du tableau de bord et des rendez-vous expert · cadence configurable par client."
      />
      <PilotageTable rows={rows} year={year} type={type} />
    </div>
  );
}
