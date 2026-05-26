import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "../_components";
import { loadClient } from "../_data";
import { TASK_ORDER } from "@/app/onboarding/task-order";
import OnboardingEditor, {
  type OnboardingTask,
  type OnboardingStatusOption,
} from "./onboarding-editor";

export const dynamic = "force-dynamic";

const ONBOARDING_LABEL: Record<string, string> = {
  tally_crea_pdc: "Tally rempli",
  acces_pennylane: "Accès Pennylane créé",
  depot_kbis_banque: "Dépôt KBIS auprès de la banque",
  confrere: "Reprise confrère",
  abo_moon: "Abonnement MOON actif",
  mandat_moon: "Mandat de prélèvement MOON signé",
  impot_gouv: "Accès au compte impôt.gouv",
  mandat_impots: "Mandat des impôts signé et envoyé à la banque",
  cfe_1447: "751-SD ou 1447 CFE signé et déposé sur messagerie",
  ob_pennylane: "Onboarding Pennylane réalisé",
  option_ir_is: "Lettre d'option IR/IS",
  previ_tns: "Prévisionnel TNS réalisé",
  affiliation_tns: "Affiliation TNS réalisée",
};

/**
 * Onglet "Onboarding" du client : checklist numérotée dans l'ordre métier.
 * Une seule liste linéaire (pas de regroupement par catégorie DB).
 * Création automatique au moment de la signature LDM (cf. LDMSigneeButton).
 */
export default async function OnboardingTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await loadClient(slug);
  if (!client) notFound();

  const sb = await createClient();
  const [{ data: tasks }, { data: options }] = await Promise.all([
    sb
      .from("onboarding_tasks")
      .select("id, task_key, categorie, statut_logique, statut_detail")
      .eq("client_id", client.id),
    sb
      .from("status_options")
      .select("type_code, libelle, statut_logique, ordre, color")
      .eq("scope", "onboarding")
      .eq("actif", true)
      .order("ordre"),
  ]);

  // Options par task_key
  const optionsByKey: Record<string, OnboardingStatusOption[]> = {};
  for (const o of options ?? []) {
    if (!optionsByKey[o.type_code]) optionsByKey[o.type_code] = [];
    optionsByKey[o.type_code].push({
      libelle: o.libelle,
      statut_logique: o.statut_logique as OnboardingStatusOption["statut_logique"],
      color: o.color ?? null,
    });
  }

  // Tri des tâches selon l'ordre métier canonique (TASK_ORDER).
  // Les tâches legacy (hors TASK_ORDER) tombent à la fin.
  const orderIdx = (k: string) => {
    const i = TASK_ORDER.indexOf(k);
    return i === -1 ? 999 : i;
  };
  const allTasks: OnboardingTask[] = (tasks ?? [])
    .map((t) => ({
      id: t.id,
      task_key: t.task_key,
      categorie: t.categorie,
      statut_logique: t.statut_logique as OnboardingTask["statut_logique"],
      statut_detail: t.statut_detail,
      label: ONBOARDING_LABEL[t.task_key] ?? t.task_key,
    }))
    .sort((a, b) => orderIdx(a.task_key) - orderIdx(b.task_key));

  // Stats globales
  const total = allTasks.length;
  const done = allTasks.filter(
    (t) => t.statut_logique === "TERMINE" || t.statut_logique === "NON_APPLICABLE"
  ).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header progression */}
      <Card title="Progression onboarding">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune tâche d&apos;onboarding pour ce client. Elles sont créées
            automatiquement au moment de la signature LDM (bouton « LDM signée 🎉 »).
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-zinc-800">
                {done} / {total} tâches
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {total === 0 ? null : (
        <Card title="Checklist">
          <OnboardingEditor tasks={allTasks} optionsByKey={optionsByKey} numbered />
        </Card>
      )}
    </div>
  );
}
