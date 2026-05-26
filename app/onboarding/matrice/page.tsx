import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import MatriceTable, {
  type EtapeColumn,
  type MatriceRow,
  type StatutLogique,
  type MatriceTaskCell,
  type OnboardingStatusOption,
} from "./matrice-table";

export const dynamic = "force-dynamic";

/**
 * Vue matricielle transverse de l'onboarding.
 *
 * Les colonnes sont déduites du parcours par défaut (table onboarding_etape) :
 *   - nom_court  → entête de colonne
 *   - libelle    → tooltip + titre du popover
 *   - ordre      → ordre des colonnes
 * Les anciens libellés codés en dur (TASK_SHORT_LABEL / TASK_LONG_LABEL)
 * sont remplacés par la donnée DB depuis la migration 0042.
 */
export default async function OnboardingMatricePage() {
  const sb = await createClient();

  // 1. Clients facturables
  const { data: clients } = await sb
    .from("clients")
    .select("id, slug, denomination, siren, forme, pipeline_statut, origine, gestion_tns")
    .order("denomination");

  const billable = (clients ?? []).filter(isClientBillable);
  const clientIds = billable.map((c) => c.id);

  // 2. Étapes du parcours par défaut + tâches client + status_options en parallèle
  const [
    { data: parcours },
    { data: tasks },
    { data: options },
  ] = await Promise.all([
    sb
      .from("onboarding_parcours")
      .select("id, onboarding_etape(task_key, nom_court, libelle, ordre)")
      .eq("is_default", true)
      .order("ordre", { foreignTable: "onboarding_etape", ascending: true })
      .maybeSingle(),
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

  // Colonnes = étapes du parcours par défaut (vide si pas de parcours seedé)
  const etapesRaw =
    (parcours?.onboarding_etape ?? []) as Array<{
      task_key: string;
      nom_court: string;
      libelle: string;
      ordre: number;
    }>;
  const etapes: EtapeColumn[] = etapesRaw.map((e) => ({
    task_key: e.task_key,
    nom_court: e.nom_court,
    libelle: e.libelle,
  }));
  const taskKeys = etapes.map((e) => e.task_key);

  // 3. Index : client_id → task_key → cell
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

  // 4. Options par task_key (pour le picker inline)
  const optionsByKey: Record<string, OnboardingStatusOption[]> = {};
  for (const o of options ?? []) {
    if (!optionsByKey[o.type_code]) optionsByKey[o.type_code] = [];
    optionsByKey[o.type_code].push({
      libelle: o.libelle,
      statut_logique: o.statut_logique as StatutLogique,
      color: o.color ?? null,
    });
  }

  // 5. Construction des lignes
  const rows: MatriceRow[] = billable.map((c) => {
    const taskMap = byClient.get(c.id) ?? new Map<string, MatriceTaskCell>();
    const tasksCells: Array<MatriceTaskCell | null> = taskKeys.map(
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
    <MatriceTable rows={rows} etapes={etapes} optionsByKey={optionsByKey} />
  );
}
