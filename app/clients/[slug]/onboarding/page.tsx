import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cn, STATUT_COLORS } from "@/lib/utils";
import { Card, groupBy } from "../_components";
import { loadClient } from "../_data";

export const dynamic = "force-dynamic";

type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

const STATUT_LABEL: Record<StatutLogique, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  NON_APPLICABLE: "N/A",
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

const CAT_LABEL: Record<string, string> = {
  "2G": "Admin général",
  "2C": "Création",
  "2R": "Reprise",
  "2T": "TNS",
};

/**
 * Onglet "Onboarding" : liste des tâches d'onboarding du dossier groupées
 * par catégorie (Admin général / Création / Reprise / TNS).
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
  const { data: onboarding } = await sb
    .from("onboarding_tasks")
    .select("task_key, categorie, statut_logique, statut_detail")
    .eq("client_id", client.id);

  type Task = {
    task_key: string;
    categorie: string;
    statut_logique: StatutLogique;
    statut_detail: string | null;
  };
  const onboardingByCat = groupBy((onboarding ?? []) as Task[], (t) => t.categorie);

  return (
    <Card title={`Onboarding (${onboarding?.length ?? 0} tâche${(onboarding?.length ?? 0) > 1 ? "s" : ""})`}>
      {!onboarding?.length ? (
        <p className="text-sm text-muted-foreground">Aucune tâche d&apos;onboarding renseignée.</p>
      ) : (
        <div className="space-y-4">
          {(["2G", "2C", "2R", "2T"] as const).map((cat) => {
            const tasks = onboardingByCat[cat];
            if (!tasks?.length) return null;
            return (
              <div key={cat}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  {CAT_LABEL[cat]}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {tasks.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-white text-sm"
                    >
                      <div className="font-medium">
                        {ONBOARDING_LABEL[t.task_key] ?? t.task_key}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t.statut_detail}</span>
                        <span
                          className={cn(
                            "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border",
                            STATUT_COLORS[t.statut_logique]
                          )}
                        >
                          {STATUT_LABEL[t.statut_logique]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
