import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "../_components";
import { loadClient } from "../_data";
import OnboardingEditor, {
  type OnboardingTask,
  type OnboardingStatusOption,
} from "./onboarding-editor";

export const dynamic = "force-dynamic";

// Fallback de libelles pour les anciennes taches dont la task_key n'est pas
// (encore) dans onboarding_etape (ex. migration partielle). Pour le reste,
// on prend le libelle depuis onboarding_etape — c'est la source de verite.
const ONBOARDING_LABEL_FALLBACK: Record<string, string> = {
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
  const [{ data: tasks }, { data: options }, { data: parcours }] = await Promise.all([
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
    sb
      .from("onboarding_parcours")
      .select("id, onboarding_etape(task_key, libelle, ordre)")
      .eq("is_default", true)
      .order("ordre", { foreignTable: "onboarding_etape", ascending: true })
      .maybeSingle(),
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

  // Index des etapes du parcours par defaut. Sert :
  //   - a filtrer les taches orphelines (etape supprimee cote parametrage)
  //   - a recuperer le libelle a jour (source de verite = onboarding_etape)
  //   - a etablir l'ordre des taches (selon "ordre" en DB, pas un mapping fige)
  const etapesRaw =
    (parcours?.onboarding_etape ?? []) as Array<{
      task_key: string;
      libelle: string;
      ordre: number;
    }>;
  const etapeByKey = new Map<string, { libelle: string; ordre: number }>();
  for (const e of etapesRaw) {
    etapeByKey.set(e.task_key, { libelle: e.libelle, ordre: e.ordre });
  }

  // On ne garde que les taches dont la task_key existe encore dans le
  // parcours par defaut. Les taches orphelines (etape supprimee) ne sont
  // plus affichees ici. La suppression cote DB se fait via deleteEtape,
  // ce filtre couvre le cas legacy.
  const allTasks: OnboardingTask[] = (tasks ?? [])
    .filter((t) => etapeByKey.has(t.task_key))
    .map((t) => {
      const etape = etapeByKey.get(t.task_key);
      return {
        id: t.id,
        task_key: t.task_key,
        categorie: t.categorie,
        statut_logique: t.statut_logique as OnboardingTask["statut_logique"],
        statut_detail: t.statut_detail,
        label: etape?.libelle ?? ONBOARDING_LABEL_FALLBACK[t.task_key] ?? t.task_key,
      };
    })
    .sort((a, b) => {
      const oa = etapeByKey.get(a.task_key)?.ordre ?? 999;
      const ob = etapeByKey.get(b.task_key)?.ordre ?? 999;
      return oa - ob;
    });

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
