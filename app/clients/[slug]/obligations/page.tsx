import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ObligationsMatrix, {
  type Sub as MatrixSub,
  type YearConfig as MatrixYC,
} from "../obligations-matrix";
import { loadClient, loadActiveTvaTags } from "../_data";
import PilotageCard, { type PilotageActiveMap } from "../pilotage-card";
import TvaFieldsCard from "../tva-fields-card";
import { EditableGestionTns } from "../editable-extras";
import { Card } from "../_components";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;

/**
 * Onglet "Obligations" : matrice paramétrage par année + Card Pilotage
 * (totalement isolee : utilise pilotage_obligations, pas l'enum partage).
 */
export default async function ObligationsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await loadClient(slug);
  if (!client) notFound();
  const id = client.id;

  const currentTvaTagId = (client as unknown as { tva_tag_id: string | null }).tva_tag_id ?? null;
  const currentTvaEcheanceJour =
    (client as unknown as { tva_echeance_jour: number | null }).tva_echeance_jour ?? null;

  const sb = await createClient();
  const [{ data: allSubs }, { data: yearConfigs }, tvaTags] = await Promise.all([
    sb.from("obligation_subscriptions").select("type, annee, actif").eq("client_id", id),
    sb.from("client_year_config").select("annee, regime").eq("client_id", id),
    loadActiveTvaTags(currentTvaTagId),
  ]);

  const subYears = new Set<number>((allSubs ?? []).map((s) => s.annee));
  subYears.add(CURRENT_YEAR);
  subYears.add(CURRENT_YEAR + 1);
  const yearsList = [...subYears].sort((a, b) => a - b);
  const matrixSubs: MatrixSub[] = (allSubs ?? []).map((s) => ({
    type: s.type,
    annee: s.annee,
    actif: !!s.actif,
  }));
  const matrixYC: MatrixYC[] = (yearConfigs ?? []).map((c) => ({
    annee: c.annee,
    regime: (c.regime as "IR" | "IS" | null) ?? null,
  }));

  // Defensive : les requetes pilotage peuvent echouer si la migration 0062/0063
  // n'est pas encore appliquee -> on fallback a un objet vide. La Card sera
  // presente mais tous les toggles seront off.
  let pilotageActive: PilotageActiveMap = {};
  try {
    // 1. Souscriptions par (annee, type)
    const subsRes = await sb
      .from("pilotage_obligations")
      .select("annee, type")
      .eq("client_id", id);
    if (!subsRes.error) {
      for (const row of subsRes.data ?? []) {
        const r = row as { annee: number; type: "TDB" | "RDV" };
        if (!pilotageActive[r.annee]) {
          pilotageActive[r.annee] = { TDB: false, RDV: false, tdbCadence: null, rdvCadence: null };
        }
        pilotageActive[r.annee][r.type] = true;
      }
    } else {
      // eslint-disable-next-line no-console
      console.error("[obligations/page] pilotage_obligations:", subsRes.error);
    }
    // 2. Cadences par annee (client_year_config). Fallback sur clients.* si
    //    pas de config pour cette annee (back-compat avec stockage globaux).
    const ycRes = await sb
      .from("client_year_config")
      .select("annee, tdb_livraison_periode, rdv_expert_periode")
      .eq("client_id", id);
    const fallbackTdb = (client as unknown as { tdb_livraison_periode?: string | null }).tdb_livraison_periode ?? null;
    const fallbackRdv = (client as unknown as { rdv_expert_periode?: string | null }).rdv_expert_periode ?? null;
    if (!ycRes.error) {
      for (const row of ycRes.data ?? []) {
        const r = row as { annee: number; tdb_livraison_periode: string | null; rdv_expert_periode: string | null };
        if (!pilotageActive[r.annee]) {
          pilotageActive[r.annee] = { TDB: false, RDV: false, tdbCadence: null, rdvCadence: null };
        }
        pilotageActive[r.annee].tdbCadence = r.tdb_livraison_periode ?? fallbackTdb;
        pilotageActive[r.annee].rdvCadence = r.rdv_expert_periode ?? fallbackRdv;
      }
    }
    // Pour chaque annee active sans config encore, appliquer le fallback
    for (const y of yearsList) {
      const cell = pilotageActive[y];
      if (cell) {
        if (cell.tdbCadence === null) cell.tdbCadence = fallbackTdb;
        if (cell.rdvCadence === null) cell.rdvCadence = fallbackRdv;
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[obligations/page] pilotage section throw:", e);
  }

  return (
    <div className="space-y-6">
      <ObligationsMatrix
        clientId={id}
        subs={matrixSubs}
        yearConfigs={matrixYC}
        years={yearsList}
        debutObligations={client.debut_obligations}
      />
      <PilotageCard clientId={id} years={yearsList} active={pilotageActive} />

      {/* Paramétrage rattaché aux obligations (rapatrié de l'onglet Identité) :
          la gestion TNS et les réglages TVA pilotent de la production, pas de
          l'identité du dossier. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Gestion TNS">
          <EditableGestionTns clientId={id} value={client.gestion_tns} label="Gestion TNS" />
        </Card>
        <Card title="TVA mensuelle">
          <TvaFieldsCard
            clientId={id}
            initialTagId={currentTvaTagId}
            initialEcheanceJour={currentTvaEcheanceJour}
            tags={tvaTags}
          />
        </Card>
      </div>
    </div>
  );
}
