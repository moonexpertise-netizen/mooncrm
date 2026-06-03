import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ObligationsMatrix, {
  type Sub as MatrixSub,
  type YearConfig as MatrixYC,
} from "../obligations-matrix";
import { loadClient } from "../_data";
import PilotageCard, { type PilotageActiveMap } from "../pilotage-card";

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

  // Defensive : la requete pilotage_obligations peut echouer si la table
  // n'existe pas encore (migration 0062 pas appliquee) -> on fallback a
  // un objet vide. La Card sera presente mais tous les toggles seront off.
  let pilotageActive: PilotageActiveMap = {};
  let tdbCadence: string | null = null;
  let rdvCadence: string | null = null;
  try {
    const pilotageRes = await sb
      .from("pilotage_obligations")
      .select("annee, type")
      .eq("client_id", id);
    if (!pilotageRes.error) {
      const map: PilotageActiveMap = {};
      for (const row of pilotageRes.data ?? []) {
        const r = row as { annee: number; type: "TDB" | "RDV" };
        if (!map[r.annee]) map[r.annee] = { TDB: false, RDV: false };
        map[r.annee][r.type] = true;
      }
      pilotageActive = map;
    } else {
      // eslint-disable-next-line no-console
      console.error("[obligations/page] pilotage_obligations:", pilotageRes.error);
    }
    // Cadences (sur clients, depuis colonnes 0060). Fallback null si colonnes absentes.
    tdbCadence = (client as unknown as { tdb_livraison_periode?: string | null }).tdb_livraison_periode ?? null;
    rdvCadence = (client as unknown as { rdv_expert_periode?: string | null }).rdv_expert_periode ?? null;
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
      <PilotageCard
        clientId={id}
        years={yearsList}
        active={pilotageActive}
        initialTdbCadence={tdbCadence}
        initialRdvCadence={rdvCadence}
      />
    </div>
  );
}
