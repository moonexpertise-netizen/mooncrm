import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ObligationsMatrix, {
  type Sub as MatrixSub,
  type YearConfig as MatrixYC,
} from "../obligations-matrix";
import { loadClient } from "../_data";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;

/**
 * Onglet "Obligations" : matrice paramétrage par année.
 * Active/désactive les obligations applicables au client × par année.
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

  return (
    <ObligationsMatrix
      clientId={id}
      subs={matrixSubs}
      yearConfigs={matrixYC}
      years={yearsList}
      debutObligations={client.debut_obligations}
      tdbLivraisonPeriode={(client as { tdb_livraison_periode?: string | null }).tdb_livraison_periode ?? null}
      rdvExpertPeriode={(client as { rdv_expert_periode?: string | null }).rdv_expert_periode ?? null}
    />
  );
}
