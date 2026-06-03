import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ObligationsMatrix, {
  type Sub as MatrixSub,
  type YearConfig as MatrixYC,
} from "../obligations-matrix";
import { Card } from "../_components";
import { loadClient, loadActiveTvaTags } from "../_data";
import TvaFieldsCard from "../tva-fields-card";
import PilotageFieldsCard from "../pilotage-fields-card";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;

/**
 * Onglet "Obligations" : matrice paramétrage par année + Cards de
 * configuration TVA mensuelle (étiquette + jour échéance) et Pilotage
 * (cadences TdB + RDV expert).
 *
 * On regroupe ici toute la config "production" du client (par opposition
 * à l'onglet Identité qui reste centré sur l'identité légale et les honos).
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

  const sb = await createClient();
  const [{ data: allSubs }, { data: yearConfigs }] = await Promise.all([
    sb.from("obligation_subscriptions").select("type, annee, actif").eq("client_id", id),
    sb.from("client_year_config").select("annee, regime").eq("client_id", id),
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

  // Données pour les Cards TVA mensuelle + Pilotage. Tout fallback null si
  // migration pas appliquee (cast unknown + ?? null). Aucune query ne throw
  // grâce à la robustesse de loadClient (fallback) et loadActiveTvaTags
  // (catch + return []).
  const currentTvaTagId = (client as unknown as { tva_tag_id: string | null }).tva_tag_id ?? null;
  const currentTvaEcheanceJour = (client as unknown as { tva_echeance_jour: number | null }).tva_echeance_jour ?? null;
  const currentTdbPeriode = (client as unknown as { tdb_livraison_periode: string | null }).tdb_livraison_periode ?? null;
  const currentRdvPeriode = (client as unknown as { rdv_expert_periode: string | null }).rdv_expert_periode ?? null;
  const tvaTags = await loadActiveTvaTags(currentTvaTagId);

  return (
    <div className="space-y-6">
      <ObligationsMatrix
        clientId={id}
        subs={matrixSubs}
        yearConfigs={matrixYC}
        years={yearsList}
        debutObligations={client.debut_obligations}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="TVA mensuelle">
          <TvaFieldsCard
            clientId={id}
            initialTagId={currentTvaTagId}
            initialEcheanceJour={currentTvaEcheanceJour}
            tags={tvaTags}
          />
        </Card>

        <Card title="Pilotage / Dashboard">
          <PilotageFieldsCard
            clientId={id}
            initialTdbPeriode={currentTdbPeriode}
            initialRdvPeriode={currentRdvPeriode}
          />
        </Card>
      </div>
    </div>
  );
}
