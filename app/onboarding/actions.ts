"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server actions du module Onboarding.
 *
 * Workflow métier (cf. screen de Benjamin) :
 *
 *   La liste des tâches dépend de 2 axes :
 *     - Origine du dossier : Création (1/2) vs Reprise (3/4) vs Sous-traitance
 *     - Gestion TNS : true / false (caractéristique éditable du dossier)
 *
 *   Tâches COMMUNES (toujours) :
 *     1. Tally rempli                   (tally_crea_pdc)
 *     2. Accès Pennylane créé           (acces_pennylane)
 *     3. Abo MOON actif                 (abo_moon)
 *     4. Mandat MOON signé              (mandat_moon)
 *     5. Accès impôt.gouv               (impot_gouv)
 *     6. Mandat impôts signé/envoyé     (mandat_impots)
 *     7. 751-SD / 1447 CFE              (cfe_1447)
 *     8. Onboarding Pennylane réalisé   (ob_pennylane)
 *     9. Lettre d'option IR/IS          (option_ir_is)
 *
 *   Tâche CRÉATION uniquement :
 *    10. Dépôt KBIS auprès de la banque (depot_kbis_banque)
 *
 *   Tâche REPRISE uniquement :
 *    10. Reprise confrère               (confrere)
 *
 *   Tâches TNS (si gestion_tns = true) :
 *    11. Prévisionnel TNS réalisé       (previ_tns)
 *    12. Affiliation TNS réalisée       (affiliation_tns)
 *
 * Note : l'ancienne tâche `reprise_compta` n'est plus créée automatiquement
 * (remplacée par `confrere` dans le workflow Benjamin). Si elle existe sur
 * des dossiers historiques, on la laisse en place mais elle ne sera pas
 * recréée.
 */

type Categorie = "2G" | "2C" | "2R" | "2T";

/**
 * Mapping task_key → catégorie DB (pour insertion). Aligné avec l'enum
 * onboarding_categorie de la migration 0001.
 *
 * Note : option_ir_is est en 2G (commune à toutes origines, pas 2T).
 */
const TASK_TO_CAT: Record<string, Categorie> = {
  tally_crea_pdc: "2G",
  acces_pennylane: "2G",
  abo_moon: "2G",
  mandat_moon: "2G",
  impot_gouv: "2G",
  mandat_impots: "2G",
  cfe_1447: "2G",
  ob_pennylane: "2G",
  option_ir_is: "2G",
  depot_kbis_banque: "2C",
  confrere: "2R",
  previ_tns: "2T",
  affiliation_tns: "2T",
};

/**
 * Retourne la liste des task_keys à créer pour un dossier donné, dans l'ordre
 * d'affichage métier (1 = première à faire).
 */
function taskKeysFor(origine: string | null, gestionTns: boolean | null): string[] {
  const isCreation =
    origine?.startsWith("1 -") === true || origine?.startsWith("2 -") === true;
  const isReprise =
    origine?.startsWith("3 -") === true || origine?.startsWith("4 -") === true;
  // Sous-traitance ou origine inconnue : checklist allégée (juste les communes).

  // Liste de base (commune)
  const tasks: string[] = [
    "tally_crea_pdc",
    "acces_pennylane",
  ];

  // Étape conditionnelle origine (3e position)
  if (isCreation) {
    tasks.push("depot_kbis_banque");
  } else if (isReprise) {
    tasks.push("confrere");
  }

  // Suite commune
  tasks.push(
    "abo_moon",
    "mandat_moon",
    "impot_gouv",
    "mandat_impots",
    "cfe_1447",
    "ob_pennylane",
    "option_ir_is"
  );

  // Tâches TNS si activé
  if (gestionTns === true) {
    tasks.push("previ_tns", "affiliation_tns");
  }

  return tasks;
}

/**
 * Initialise (ou complète) les tâches d'onboarding d'un client.
 *
 * Idempotent : si la tâche existe déjà, on la laisse telle quelle (statut
 * non touché). Si elle n'existe pas, on la crée en A_FAIRE avec le libellé
 * par défaut depuis status_options.
 *
 * Appelée :
 *   - Automatiquement quand on clique "LDM signée 🎉"
 *   - Manuellement plus tard si besoin (changement gestion_tns,
 *     bascule origine, etc.) — appel sécurisé grâce à l'idempotence
 */
export async function initializeOnboardingForClient(clientId: string) {
  const sb = await createClient();

  // 1. Origine + gestion_tns du client
  const { data: client, error: e0 } = await sb
    .from("clients")
    .select("origine, gestion_tns")
    .eq("id", clientId)
    .single();
  if (e0) throw new Error(e0.message);
  const targetKeys = taskKeysFor(client.origine, client.gestion_tns);

  // 2. task_keys déjà créées (pour ne pas écraser)
  const { data: existing } = await sb
    .from("onboarding_tasks")
    .select("task_key")
    .eq("client_id", clientId);
  const existingSet = new Set((existing ?? []).map((t) => t.task_key));

  // 3. Libellés A_FAIRE par défaut depuis status_options
  const { data: defaults } = await sb
    .from("status_options")
    .select("type_code, libelle, ordre")
    .eq("scope", "onboarding")
    .eq("statut_logique", "A_FAIRE")
    .eq("actif", true)
    .in("type_code", targetKeys)
    .order("ordre");
  const defaultLibelleByKey = new Map<string, string>();
  for (const d of defaults ?? []) {
    if (!defaultLibelleByKey.has(d.type_code))
      defaultLibelleByKey.set(d.type_code, d.libelle);
  }

  // 4. Insert des tâches manquantes uniquement
  const toInsert: Array<{
    client_id: string;
    task_key: string;
    categorie: Categorie;
    statut_logique: "A_FAIRE";
    statut_detail: string | null;
  }> = [];
  for (const key of targetKeys) {
    if (existingSet.has(key)) continue;
    const cat = TASK_TO_CAT[key];
    if (!cat) continue; // sécurité : task_key inconnu
    toInsert.push({
      client_id: clientId,
      task_key: key,
      categorie: cat,
      statut_logique: "A_FAIRE",
      statut_detail: defaultLibelleByKey.get(key) ?? null,
    });
  }
  if (toInsert.length > 0) {
    const { error: e1 } = await sb.from("onboarding_tasks").insert(toInsert);
    if (e1) throw new Error(e1.message);
  }
  return { created: toInsert.length, totalTasks: targetKeys.length };
}

/**
 * Met à jour le statut d'une tâche d'onboarding à partir d'un libellé.
 * Si libelle=null, remet à zéro (A_FAIRE + libellé par défaut).
 */
export async function updateOnboardingTaskStatus(
  taskId: string,
  libelle: string | null
) {
  const sb = await createClient();

  const { data: task, error: e0 } = await sb
    .from("onboarding_tasks")
    .select("task_key")
    .eq("id", taskId)
    .single();
  if (e0) throw new Error(e0.message);

  if (!libelle) {
    const { data: def } = await sb
      .from("status_options")
      .select("libelle")
      .eq("scope", "onboarding")
      .eq("type_code", task.task_key)
      .eq("statut_logique", "A_FAIRE")
      .eq("actif", true)
      .order("ordre")
      .limit(1)
      .maybeSingle();
    const { error } = await sb
      .from("onboarding_tasks")
      .update({ statut_logique: "A_FAIRE", statut_detail: def?.libelle ?? null })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: opt } = await sb
    .from("status_options")
    .select("statut_logique")
    .eq("scope", "onboarding")
    .eq("type_code", task.task_key)
    .eq("libelle", libelle)
    .maybeSingle();
  const statut_logique = opt?.statut_logique ?? "A_FAIRE";

  const { error } = await sb
    .from("onboarding_tasks")
    .update({ statut_logique, statut_detail: libelle })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}
