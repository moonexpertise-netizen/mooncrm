import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, groupBy } from "../_components";
import { loadClient } from "../_data";
import OnboardingEditor, {
  type OnboardingTask,
  type OnboardingStatusOption,
} from "./onboarding-editor";

export const dynamic = "force-dynamic";

const CAT_LABEL: Record<string, string> = {
  "2G": "Admin général",
  "2C": "Création",
  "2R": "Reprise",
  "2T": "TNS",
};

const ONBOARDING_LABEL: Record<string, string> = {
  tally_crea_pdc: "Tally Créa / PDC",
  abo_moon: "Abo MOON",
  mandat_moon: "Mandat MOON",
  mandat_impots: "Mandat Impôts",
  impot_gouv: "Impot.gouv",
  cfe_1447: "CFE 1447",
  acces_pennylane: "Accès Pennylane",
  ob_pennylane: "OB Pennylane",
  depot_kbis_banque: "Dépôt KBIS Banque",
  confrere: "Confrère",
  reprise_compta: "Reprise compta",
  affiliation_tns: "Affiliation TNS",
  option_ir_is: "Lettre d'option IR/IS",
  previ_tns: "Prévi TNS",
};

/**
 * Onglet "Onboarding" : édition inline du statut de chaque tâche.
 * Les statuts viennent de status_options scope='onboarding'.
 * La création des tâches est automatique au moment de la signature LDM (cf.
 * LDMSigneeButton → initializeOnboardingForClient).
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

  // Regroupe options par task_key pour passage aux <OnboardingEditor> rows
  const optionsByKey: Record<string, OnboardingStatusOption[]> = {};
  for (const o of options ?? []) {
    if (!optionsByKey[o.type_code]) optionsByKey[o.type_code] = [];
    optionsByKey[o.type_code].push({
      libelle: o.libelle,
      statut_logique: o.statut_logique as OnboardingStatusOption["statut_logique"],
      color: o.color ?? null,
    });
  }

  const allTasks: OnboardingTask[] = (tasks ?? []).map((t) => ({
    id: t.id,
    task_key: t.task_key,
    categorie: t.categorie,
    statut_logique: t.statut_logique as OnboardingTask["statut_logique"],
    statut_detail: t.statut_detail,
    label: ONBOARDING_LABEL[t.task_key] ?? t.task_key,
  }));
  const byCat = groupBy(allTasks, (t) => t.categorie);

  // Stats globales pour le compteur
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
            automatiquement au moment de la signature LDM.
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
        <div className="space-y-4">
          {(["2G", "2C", "2R", "2T"] as const).map((cat) => {
            const list = byCat[cat];
            if (!list?.length) return null;
            const catDone = list.filter(
              (t) =>
                t.statut_logique === "TERMINE" ||
                t.statut_logique === "NON_APPLICABLE"
            ).length;
            return (
              <Card key={cat} title={`${CAT_LABEL[cat]} · ${catDone}/${list.length}`}>
                <OnboardingEditor tasks={list} optionsByKey={optionsByKey} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
