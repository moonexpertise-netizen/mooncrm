import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import PilotageTable, { type PilotageRow, type PilotageCell } from "./pilotage-table";
import { isClientBillable } from "@/lib/billable";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Page "Pilotage" : suivi TdB livraison + RDV Expert REGROUPÉS sur une seule
 * vue, à raison de 2 lignes par client (ligne 1 = Tableau de bord, ligne 2 =
 * RDV Expert). La logique reste 100% dissociée : chaque ligne lit/écrit son
 * propre type dans pilotage_obligations (TDB vs RDV) et sa propre cadence.
 *
 * Architecture :
 *   - Table pilotage_obligations (cf. migration 0062), isolee de la table
 *     obligations principale.
 *   - Cadences (Mensuelle/Trimestrielle) par (client, annee) dans
 *     client_year_config (fallback clients.tdb_livraison_periode /
 *     rdv_expert_periode pour le legacy).
 */
export default async function PilotagePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;

  const sb = await createClient();

  // 1. Toutes les pilotage_obligations de l'année (LES DEUX types TDB + RDV).
  const { data: oblig } = await sb
    .from("pilotage_obligations")
    .select("id, client_id, type, periode, statut_logique, statut_detail")
    .eq("annee", year);
  type Ob = {
    id: string;
    client_id: string;
    type: "TDB" | "RDV";
    periode: string;
    statut_logique: string;
    statut_detail: string | null;
  };
  const obs = (oblig ?? []) as Ob[];
  // Clients souscrits = ceux ayant au moins une oblig pilotage (TDB OU RDV).
  const subscribedClientIds = [...new Set(obs.map((o) => o.client_id))];

  if (subscribedClientIds.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pilotage"
          description="Suivi de la mise à disposition du tableau de bord et des rendez-vous expert, cadence configurable par client."
        />
        <PilotageTable rows={[]} year={year} />
      </div>
    );
  }

  const { data: clientsRaw } = await sb
    .from("clients")
    .select(
      "id, slug, denomination, siren, pipeline_statut, origine, tdb_livraison_periode, rdv_expert_periode"
    )
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

  // 2. Cadences par (client, annee) depuis client_year_config (cf. 0063),
  //    fallback sur les colonnes clients pour le legacy.
  const { data: ycRaw } = await sb
    .from("client_year_config")
    .select("client_id, annee, tdb_livraison_periode, rdv_expert_periode")
    .in("client_id", subscribedClientIds)
    .eq("annee", year);
  const ycByClient = new Map<string, { tdb: string | null; rdv: string | null }>();
  for (const yc of (ycRaw ?? []) as Array<{
    client_id: string;
    tdb_livraison_periode: string | null;
    rdv_expert_periode: string | null;
  }>) {
    ycByClient.set(yc.client_id, {
      tdb: yc.tdb_livraison_periode,
      rdv: yc.rdv_expert_periode,
    });
  }

  function cellsFor(clientId: string, type: "TDB" | "RDV"): Map<string, PilotageCell> {
    const m = new Map<string, PilotageCell>();
    for (const o of obs) {
      if (o.client_id !== clientId || o.type !== type) continue;
      m.set(o.periode, {
        id: o.id,
        statut_logique: o.statut_logique as PilotageCell["statut_logique"],
        statut_detail: o.statut_detail,
      });
    }
    return m;
  }

  // 3. 1 entrée par client, avec ses 2 sous-suivis (tdb + rdv).
  const rows: PilotageRow[] = clients.map((c) => {
    const yc = ycByClient.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      siren: c.siren,
      tdb: {
        cadence: (yc?.tdb ?? c.tdb_livraison_periode) ?? null,
        cells: cellsFor(c.id, "TDB"),
      },
      rdv: {
        cadence: (yc?.rdv ?? c.rdv_expert_periode) ?? null,
        cells: cellsFor(c.id, "RDV"),
      },
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pilotage"
        description="Suivi de la mise à disposition du tableau de bord et des rendez-vous expert, cadence configurable par client."
      />
      <PilotageTable rows={rows} year={year} />
    </div>
  );
}
