import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import { TASK_ORDER } from "@/app/onboarding/task-order";
import MatriceTable, {
  type MatriceRow,
  type StatutLogique,
  type MatriceTaskCell,
  type OnboardingStatusOption,
} from "./matrice-table";

export const dynamic = "force-dynamic";

/**
 * Vue matricielle transverse de l'onboarding.
 *
 * Format : 1 ligne par dossier × 1 colonne par tâche canonique (13 colonnes
 * dans l'ordre métier de TASK_ORDER). Chaque cellule = statut pastille
 * (terminé / en cours / à faire / N/A / absent pour ce dossier).
 *
 * Édition inline : on charge aussi `status_options` pour permettre à Benjamin
 * de cliquer une cellule et choisir un statut sans quitter la matrice. Le
 * task_id est exposé pour pouvoir cibler la bonne tâche au save.
 */
export default async function OnboardingMatricePage() {
  const sb = await createClient();

  const { data: clients } = await sb
    .from("clients")
    .select("id, slug, denomination, siren, forme, pipeline_statut, origine, gestion_tns")
    .order("denomination");

  const billable = (clients ?? []).filter(isClientBillable);
  const clientIds = billable.map((c) => c.id);

  // Tâches + status_options en parallèle
  const [{ data: tasks }, { data: options }] = await Promise.all([
    clientIds.length
      ? sb
          .from("onboarding_tasks")
          .select("id, client_id, task_key, statut_logique, statut_detail")
          .in("client_id", clientIds)
      : Promise.resolve({ data: [] as Array<{
          id: string;
          client_id: string;
          task_key: string;
          statut_logique: string;
          statut_detail: string | null;
        }> }),
    sb
      .from("status_options")
      .select("type_code, libelle, statut_logique, ordre, color")
      .eq("scope", "onboarding")
      .eq("actif", true)
      .order("ordre"),
  ]);

  // Index : client_id → task_key → cell
  type TaskRow = {
    id: string;
    client_id: string;
    task_key: string;
    statut_logique: string;
    statut_detail: string | null;
  };
  const byClient = new Map<string, Map<string, MatriceTaskCell>>();
  for (const c of billable) byClient.set(c.id, new Map());
  for (const t of (tasks ?? []) as TaskRow[]) {
    byClient.get(t.client_id)?.set(t.task_key, {
      id: t.id,
      statut_logique: t.statut_logique as StatutLogique,
      statut_detail: t.statut_detail,
    });
  }

  // Options par task_key (pour le picker inline)
  const optionsByKey: Record<string, OnboardingStatusOption[]> = {};
  for (const o of options ?? []) {
    if (!optionsByKey[o.type_code]) optionsByKey[o.type_code] = [];
    optionsByKey[o.type_code].push({
      libelle: o.libelle,
      statut_logique: o.statut_logique as StatutLogique,
      color: o.color ?? null,
    });
  }

  const rows: MatriceRow[] = billable.map((c) => {
    const taskMap = byClient.get(c.id) ?? new Map<string, MatriceTaskCell>();
    const tasksCells: Array<MatriceTaskCell | null> = TASK_ORDER.map(
      (k) => taskMap.get(k) ?? null
    );
    let done = 0;
    let total = 0;
    for (const cell of tasksCells) {
      if (cell === null) continue;
      total++;
      if (cell.statut_logique === "TERMINE" || cell.statut_logique === "NON_APPLICABLE") {
        done++;
      }
    }
    return {
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      siren: c.siren,
      forme: c.forme,
      origine: c.origine,
      gestion_tns: c.gestion_tns,
      tasks: tasksCells,
      done,
      total,
    };
  });

  return (
    <MatriceTable rows={rows} taskKeys={TASK_ORDER} optionsByKey={optionsByKey} />
  );
}
