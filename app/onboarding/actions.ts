"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server actions du module Onboarding.
 *
 * Architecture : table public.onboarding_tasks contient 1 row par
 * (client_id, task_key). Les 14 tâches sont réparties en 4 catégories :
 *   - 2G : Admin général (toujours)
 *   - 2C : Création (uniquement origine "Création*")
 *   - 2R : Reprise (uniquement origine "Reprise*")
 *   - 2T : TNS (toujours, mais peut être mis en N/A pour les SAS/SARL
 *          si le dirigeant n'est pas TNS)
 */

type Categorie = "2G" | "2C" | "2R" | "2T";

// 14 task_keys mappées sur leur catégorie. Doit rester aligné avec l'enum
// `onboarding_task_key` côté DB (migration 0001).
const TASKS_BY_CAT: Record<Categorie, string[]> = {
  "2G": [
    "tally_crea_pdc",
    "abo_moon",
    "mandat_moon",
    "mandat_impots",
    "impot_gouv",
    "cfe_1447",
    "acces_pennylane",
    "ob_pennylane",
  ],
  "2C": ["depot_kbis_banque"],
  "2R": ["confrere", "reprise_compta"],
  "2T": ["affiliation_tns", "option_ir_is", "previ_tns"],
};

/**
 * Détermine les catégories de tâches à créer selon l'origine du dossier.
 *
 *   "1 - Création", "2 - Création par Tiers" → 2G + 2C (+ 2T)
 *   "3 - Reprise",  "4 - Reprise sans EC"    → 2G + 2R (+ 2T)
 *   "Z - Sous-traitance"                     → 2G uniquement
 *   autre / null                              → 2G uniquement (sûr)
 *
 * 2T (TNS) est inclus systématiquement sauf sous-traitance car on ne sait pas
 * à l'avance si le dirigeant est TNS. L'utilisateur pourra mettre les tâches
 * 2T en "N/A" pour les SAS/SARL où le dirigeant est assimilé salarié.
 */
function categoriesForOrigine(origine: string | null): Categorie[] {
  if (!origine) return ["2G"];
  if (origine.startsWith("1 -") || origine.startsWith("2 -")) {
    return ["2G", "2C", "2T"];
  }
  if (origine.startsWith("3 -") || origine.startsWith("4 -")) {
    return ["2G", "2R", "2T"];
  }
  if (origine.startsWith("Z -")) {
    return ["2G"];
  }
  return ["2G"];
}

/**
 * Initialise (ou complète) les tâches d'onboarding d'un client.
 *
 * Idempotent : si la tâche existe déjà, on la laisse telle quelle (on ne
 * réinitialise PAS son statut). Si elle n'existe pas, on la crée en A_FAIRE
 * avec le libellé par défaut depuis status_options.
 *
 * Appelée :
 *   - Automatiquement quand on clique "LDM signée 🎉" (côté LDMSigneeButton)
 *   - Manuellement plus tard si besoin de regénérer (catégorie ajoutée)
 */
export async function initializeOnboardingForClient(clientId: string) {
  const sb = await createClient();

  // 1. Origine du client pour déterminer les catégories à créer
  const { data: client, error: e0 } = await sb
    .from("clients")
    .select("origine")
    .eq("id", clientId)
    .single();
  if (e0) throw new Error(e0.message);
  const cats = categoriesForOrigine(client.origine);

  // 2. Task_keys déjà créées pour ce client (pour ne pas écraser)
  const { data: existing } = await sb
    .from("onboarding_tasks")
    .select("task_key")
    .eq("client_id", clientId);
  const existingSet = new Set((existing ?? []).map((t) => t.task_key));

  // 3. Libellés A_FAIRE par défaut pour chaque task_key (pris dans status_options)
  const allTaskKeys = cats.flatMap((c) => TASKS_BY_CAT[c]);
  const { data: defaults } = await sb
    .from("status_options")
    .select("type_code, libelle, ordre")
    .eq("scope", "onboarding")
    .eq("statut_logique", "A_FAIRE")
    .eq("actif", true)
    .in("type_code", allTaskKeys)
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
  for (const cat of cats) {
    for (const key of TASKS_BY_CAT[cat]) {
      if (existingSet.has(key)) continue;
      toInsert.push({
        client_id: clientId,
        task_key: key,
        categorie: cat,
        statut_logique: "A_FAIRE",
        statut_detail: defaultLibelleByKey.get(key) ?? null,
      });
    }
  }
  if (toInsert.length > 0) {
    const { error: e1 } = await sb.from("onboarding_tasks").insert(toInsert);
    if (e1) throw new Error(e1.message);
  }
  return { created: toInsert.length, totalCategories: cats.length };
}

/**
 * Met à jour le statut d'une tâche d'onboarding à partir d'un libellé.
 * Lookup le statut_logique correspondant dans status_options.
 * Si libelle=null, remet à zéro (A_FAIRE + libellé par défaut).
 */
export async function updateOnboardingTaskStatus(
  taskId: string,
  libelle: string | null
) {
  const sb = await createClient();

  // Récupère la tâche pour connaître son task_key (utilisé pour le default)
  const { data: task, error: e0 } = await sb
    .from("onboarding_tasks")
    .select("task_key")
    .eq("id", taskId)
    .single();
  if (e0) throw new Error(e0.message);

  if (!libelle) {
    // Reset : statut_logique = A_FAIRE, libellé = défaut du type
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
