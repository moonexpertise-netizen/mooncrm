import { createClient } from "@/lib/supabase/server";
import OnboardingList, { type OnboardingRow } from "./onboarding-list";

export const dynamic = "force-dynamic";

const PIPELINE_OK = new Set(["7 - LDM signée", "Z - Interne"]);
const ORIGINE_OK = new Set(["Z - Sous-traitance"]);

/**
 * Vue globale onboarding : liste de tous les clients actifs avec leur
 * progression (% de tâches terminées). Cliquable pour ouvrir la fiche.
 *
 * Filtre métier : ne sont retenus que les dossiers signés / internes /
 * sous-traités (mêmes règles que le paramétrage et le tracker production).
 */
export default async function OnboardingPage() {
  const sb = await createClient();

  // 1. Tous les clients facturables (avec slug pour navigation)
  const { data: clients } = await sb
    .from("clients")
    .select("id, slug, denomination, siren, pipeline_statut, origine")
    .order("denomination");

  const billable = (clients ?? []).filter((c) => {
    return (
      (c.pipeline_statut && PIPELINE_OK.has(c.pipeline_statut)) ||
      (c.origine && ORIGINE_OK.has(c.origine))
    );
  });
  const clientIds = billable.map((c) => c.id);

  // 2. Tâches d'onboarding pour ces clients
  const { data: tasks } = clientIds.length
    ? await sb
        .from("onboarding_tasks")
        .select("client_id, statut_logique")
        .in("client_id", clientIds)
    : { data: [] };

  // 3. Agrégation par client : compte done / total
  const aggByClient = new Map<string, { total: number; done: number }>();
  for (const c of billable) aggByClient.set(c.id, { total: 0, done: 0 });
  for (const t of tasks ?? []) {
    const agg = aggByClient.get(t.client_id);
    if (!agg) continue;
    agg.total++;
    if (t.statut_logique === "TERMINE" || t.statut_logique === "NON_APPLICABLE") {
      agg.done++;
    }
  }

  const rows: OnboardingRow[] = billable.map((c) => {
    const agg = aggByClient.get(c.id) ?? { total: 0, done: 0 };
    const pct = agg.total > 0 ? Math.round((agg.done / agg.total) * 100) : 0;
    return {
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      siren: c.siren,
      pipeline_statut: c.pipeline_statut,
      origine: c.origine,
      done: agg.done,
      total: agg.total,
      pct,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Suivi de l&apos;intégration des nouveaux dossiers · dossiers signés / internes / sous-traitance
        </p>
      </div>
      <OnboardingList rows={rows} />
    </div>
  );
}
