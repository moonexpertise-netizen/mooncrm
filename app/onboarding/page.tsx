import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import OnboardingList, { type OnboardingRow } from "./onboarding-list";

export const dynamic = "force-dynamic";

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
    .select("id, slug, denomination, siren, pipeline_statut, origine, gestion_tns")
    .order("denomination");

  const billable = (clients ?? []).filter(isClientBillable);
  const clientIds = billable.map((c) => c.id);

  // 2. Taches d'onboarding + task_keys actives du parcours par defaut, en
  //    parallele. On filtre les taches dont la task_key n'est plus dans
  //    le parcours (etape supprimee cote parametrage = orpheline).
  const [{ data: tasks }, { data: parcours }] = await Promise.all([
    clientIds.length
      ? sb
          .from("onboarding_tasks")
          .select("client_id, task_key, statut_logique")
          .in("client_id", clientIds)
      : Promise.resolve({ data: [] as Array<{ client_id: string; task_key: string; statut_logique: string }> }),
    sb
      .from("onboarding_parcours")
      .select("id, onboarding_etape(task_key)")
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  const activeTaskKeys = new Set<string>(
    ((parcours?.onboarding_etape ?? []) as Array<{ task_key: string }>).map(
      (e) => e.task_key
    )
  );

  // 3. Agregation par client : compte done / total (taches actives uniquement)
  const aggByClient = new Map<string, { total: number; done: number }>();
  for (const c of billable) aggByClient.set(c.id, { total: 0, done: 0 });
  for (const t of tasks ?? []) {
    if (!activeTaskKeys.has(t.task_key)) continue; // skip orphelines
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
      gestion_tns: c.gestion_tns,
      done: agg.done,
      total: agg.total,
      pct,
    };
  });

  return <OnboardingList rows={rows} />;
}
