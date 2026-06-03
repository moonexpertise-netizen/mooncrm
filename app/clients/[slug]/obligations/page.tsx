import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ObligationsMatrix, {
  type Sub as MatrixSub,
  type YearConfig as MatrixYC,
} from "../obligations-matrix";
import { Card } from "../_components";
import { loadClient } from "../_data";
import TvaFieldsCard from "../tva-fields-card";
import PilotageFieldsCard from "../pilotage-fields-card";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;

/**
 * Onglet "Obligations" : matrice paramétrage par année + Cards de
 * configuration TVA mensuelle (étiquette + jour échéance) et Pilotage
 * (cadences TdB + RDV expert).
 *
 * ULTRA-DEFENSIVE : chaque query est wrappee dans son propre try/catch,
 * avec fallback []. Aucune exception ne peut planter le SSR (qui causerait
 * un 500 sur cette route et trigger l'error boundary).
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

  // Helper : safe query qui ne throw jamais
  async function safeQuery<T>(
    fn: () => PromiseLike<{ data: T | null; error: unknown }>,
    fallback: T,
    label: string
  ): Promise<T> {
    try {
      const r = await fn();
      if (r.error) {
        // eslint-disable-next-line no-console
        console.error(`[obligations/page ${label}]`, r.error);
        return fallback;
      }
      return r.data ?? fallback;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[obligations/page ${label}] throw:`, e);
      return fallback;
    }
  }

  const [allSubs, yearConfigs, tvaTagsRaw] = await Promise.all([
    safeQuery<Array<{ type: string; annee: number; actif: boolean | null }>>(
      () => sb.from("obligation_subscriptions").select("type, annee, actif").eq("client_id", id),
      [],
      "allSubs"
    ),
    safeQuery<Array<{ annee: number; regime: string | null }>>(
      () => sb.from("client_year_config").select("annee, regime").eq("client_id", id),
      [],
      "yearConfigs"
    ),
    // tva_tags : peut etre absent si migration 0059 pas appliquee. On utilise
    // un simple .eq("actif", true) au lieu de .or() pour eviter les surprises.
    safeQuery<Array<{ id: string; label: string; color: string; actif: boolean }>>(
      () => sb.from("tva_tags").select("id, label, color, actif").eq("actif", true).order("ordre"),
      [],
      "tvaTags"
    ),
  ]);

  const subYears = new Set<number>(allSubs.map((s) => s.annee));
  subYears.add(CURRENT_YEAR);
  subYears.add(CURRENT_YEAR + 1);
  const yearsList = [...subYears].sort((a, b) => a - b);
  const matrixSubs: MatrixSub[] = allSubs.map((s) => ({
    type: s.type,
    annee: s.annee,
    actif: !!s.actif,
  }));
  const matrixYC: MatrixYC[] = yearConfigs.map((c) => ({
    annee: c.annee,
    regime: (c.regime as "IR" | "IS" | null) ?? null,
  }));

  // Donnees client pour les Cards : tout fallback null. Casts unknown -> safe
  // meme si les colonnes n'existent pas (migrations 0059/0060 pas appliquees).
  const currentTvaTagId = (client as unknown as { tva_tag_id: string | null }).tva_tag_id ?? null;
  const currentTvaEcheanceJour = (client as unknown as { tva_echeance_jour: number | null }).tva_echeance_jour ?? null;
  const currentTdbPeriode = (client as unknown as { tdb_livraison_periode: string | null }).tdb_livraison_periode ?? null;
  const currentRdvPeriode = (client as unknown as { rdv_expert_periode: string | null }).rdv_expert_periode ?? null;

  // Si le tag du client n'est pas dans la liste actuelle des actifs (cas
  // d'un tag desactive), on l'ajoute pour ne pas perdre l'affichage.
  let tvaTags = tvaTagsRaw;
  if (currentTvaTagId && !tvaTagsRaw.some((t) => t.id === currentTvaTagId)) {
    const extra = await safeQuery<Array<{ id: string; label: string; color: string; actif: boolean }>>(
      () => sb.from("tva_tags").select("id, label, color, actif").eq("id", currentTvaTagId),
      [],
      "tvaTagCurrent"
    );
    tvaTags = [...tvaTagsRaw, ...extra];
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
