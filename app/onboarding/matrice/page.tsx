import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import { TASK_ORDER } from "@/app/onboarding/task-order";
import MatriceTable, { type MatriceRow, type StatutLogique } from "./matrice-table";

export const dynamic = "force-dynamic";

/**
 * Vue matricielle transverse de l'onboarding.
 *
 * Format : 1 ligne par dossier × 1 colonne par tâche canonique (13 colonnes
 * dans l'ordre métier de TASK_ORDER). Chaque cellule = statut pastille
 * (terminé / en cours / à faire / N/A / absent pour ce dossier).
 *
 * Utilité : voir d'un coup d'œil quelles tâches bloquent transversalement
 * sur la cohorte (ex: "Tally" rouge sur 8 dossiers = il faut relancer).
 *
 * Édition : clic sur la ligne → fiche client onglet onboarding (édition
 * inline, comme aujourd'hui). On garde la matrice en lecture pour
 * éviter de dupliquer le picker statut sur 13×N cellules.
 */
export default async function OnboardingMatricePage() {
  const sb = await createClient();

  const { data: clients } = await sb
    .from("clients")
    .select("id, slug, denomination, siren, forme, pipeline_statut, origine, gestion_tns")
    .order("denomination");

  const billable = (clients ?? []).filter(isClientBillable);
  const clientIds = billable.map((c) => c.id);

  const { data: tasks } = clientIds.length
    ? await sb
        .from("onboarding_tasks")
        .select("client_id, task_key, statut_logique")
        .in("client_id", clientIds)
    : { data: [] };

  // Index : client_id → task_key → statut_logique
  const byClient = new Map<string, Map<string, StatutLogique>>();
  for (const c of billable) byClient.set(c.id, new Map());
  for (const t of tasks ?? []) {
    byClient.get(t.client_id)?.set(t.task_key, t.statut_logique as StatutLogique);
  }

  const rows: MatriceRow[] = billable.map((c) => {
    const taskMap = byClient.get(c.id) ?? new Map<string, StatutLogique>();
    const tasksStatuts: Array<StatutLogique | null> = TASK_ORDER.map(
      (k) => taskMap.get(k) ?? null
    );
    let done = 0;
    let total = 0;
    for (const s of tasksStatuts) {
      if (s === null) continue;
      total++;
      if (s === "TERMINE" || s === "NON_APPLICABLE") done++;
    }
    return {
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      siren: c.siren,
      forme: c.forme,
      origine: c.origine,
      tasks: tasksStatuts,
      done,
      total,
    };
  });

  return <MatriceTable rows={rows} taskKeys={TASK_ORDER} />;
}
