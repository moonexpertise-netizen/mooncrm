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
 * BULLETPROOF SSR : la function entière est wrappée dans un try/catch
 * global. Si quoi que ce soit throw (query Supabase, render JSX, etc.),
 * on render un fallback minimaliste plutôt qu'un 500 → plus jamais
 * d'"An error occurred in the Server Components render".
 */
export default async function ObligationsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  let slug: string;
  try {
    slug = (await params).slug;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[obligations/page] params throw:", e);
    return <FallbackError reason="params" />;
  }

  try {
    return await renderObligationsTab(slug);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[obligations/page] FATAL render throw:", e);
    return <FallbackError reason={e instanceof Error ? e.message : "render-throw"} />;
  }
}

/** Fallback rendering : page accessible meme si tout le SSR plante. */
function FallbackError({ reason }: { reason: string }) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        Onglet Obligations temporairement indisponible
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        Une erreur est survenue côté serveur. Code : <code className="font-mono">{reason}</code>. Réessaie dans quelques instants ou ouvre les autres onglets de la fiche.
      </p>
    </div>
  );
}

async function renderObligationsTab(slug: string) {
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

  // Si le tag du client n'est pas dans la liste actuelle des actifs, on l'ajoute
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
