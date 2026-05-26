"use server";

import { createClient } from "@/lib/supabase/server";
import { shouldBeNa, type ClientContext } from "./parcours-engine";

/**
 * Server actions du module Onboarding.
 *
 * Depuis la migration 0040, la liste des étapes d'onboarding + leurs
 * conditions de N/A automatique est stockée en DB dans les tables
 * `onboarding_parcours` + `onboarding_etape`, et plus codée en dur.
 *
 * Le parcours par défaut (is_default=true) est appliqué à tous les nouveaux
 * dossiers. La logique métier MOON v1 (Création / Reprise / Interne / ST,
 * avec/sans TNS) est seedée dans la migration 0041.
 *
 * Pour modifier le parcours, voir l'UI /parametrage/onboarding.
 */

type Categorie = "2G" | "2C" | "2R" | "2T";
type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

type EtapeRow = {
  task_key: string;
  libelle: string;
  ordre: number;
  categorie: string | null;
  // Tolérant : peut être nouveau format (objet ConditionsNa) ou legacy (array)
  // — shouldBeNa() / normalize() gèrent les deux formes.
  conditions_na: unknown;
};

/**
 * Initialise (ou complète) les tâches d'onboarding d'un client à partir
 * du parcours par défaut.
 *
 * Pour chaque étape du parcours :
 *   - Si la tâche existe déjà en DB pour ce client → on ne touche à rien
 *   - Sinon, on évalue les conditions_na contre le client :
 *       - Si une condition matche → on crée la tâche en NON_APPLICABLE
 *         avec statut_detail = condition.reason
 *       - Sinon → on crée la tâche en A_FAIRE
 *
 * Appelée :
 *   - À la signature LDM (bouton "LDM signée 🎉")
 *   - Après tout changement d'origine ou de gestion_tns côté UI
 *   - Manuellement (re-init sur changement de parcours)
 */
export async function initializeOnboardingForClient(clientId: string) {
  const sb = await createClient();

  // 1. Caractéristiques du client (champs utilisés par les conditions)
  const { data: client, error: e0 } = await sb
    .from("clients")
    .select("origine, gestion_tns, forme, activite")
    .eq("id", clientId)
    .single();
  if (e0) throw new Error(e0.message);
  const ctx: ClientContext = {
    origine: client.origine,
    gestion_tns: client.gestion_tns,
    forme: client.forme,
    activite: client.activite,
  };

  // 2. Parcours par défaut + ses étapes (1 requête grâce à la FK)
  const { data: parcours } = await sb
    .from("onboarding_parcours")
    .select("id, onboarding_etape(task_key, libelle, ordre, categorie, conditions_na)")
    .eq("is_default", true)
    .order("ordre", { foreignTable: "onboarding_etape", ascending: true })
    .maybeSingle();
  if (!parcours) {
    // Pas de parcours par défaut configuré → on ne crée rien
    return { created: 0, totalTasks: 0 };
  }
  const etapes = (parcours.onboarding_etape ?? []) as EtapeRow[];

  // 3. Tâches déjà créées pour ce client (pour idempotence)
  const { data: existing } = await sb
    .from("onboarding_tasks")
    .select("task_key")
    .eq("client_id", clientId);
  const existingSet = new Set((existing ?? []).map((t) => t.task_key));

  // 4. Libellés par défaut (A_FAIRE et NON_APPLICABLE) depuis status_options
  //    On en a besoin pour pré-remplir statut_detail.
  const taskKeys = etapes.map((e) => e.task_key);
  const { data: defaults } = taskKeys.length
    ? await sb
        .from("status_options")
        .select("type_code, libelle, statut_logique, ordre")
        .eq("scope", "onboarding")
        .eq("actif", true)
        .in("type_code", taskKeys)
        .order("ordre")
    : { data: [] as Array<{ type_code: string; libelle: string; statut_logique: string; ordre: number }> };
  const defaultLibelleByKey = new Map<string, { a_faire: string | null; na: string | null }>();
  for (const d of defaults ?? []) {
    const entry = defaultLibelleByKey.get(d.type_code) ?? { a_faire: null, na: null };
    if (d.statut_logique === "A_FAIRE" && !entry.a_faire) entry.a_faire = d.libelle;
    if (d.statut_logique === "NON_APPLICABLE" && !entry.na) entry.na = d.libelle;
    defaultLibelleByKey.set(d.type_code, entry);
  }

  // 5. Construction de la liste des tâches à insérer
  const toInsert: Array<{
    client_id: string;
    task_key: string;
    categorie: Categorie;
    statut_logique: StatutLogique;
    statut_detail: string | null;
  }> = [];
  for (const etape of etapes) {
    if (existingSet.has(etape.task_key)) continue; // idempotence

    // Catégorie : on garde le mapping historique 2G/2C/2R/2T si présent,
    // sinon on tombe sur "2G" par défaut.
    const cat = (etape.categorie as Categorie) || "2G";

    // Évaluation des conditions de N/A (nouveau format avec combinator + multi-values)
    const isNa = shouldBeNa(etape.conditions_na, ctx);
    const labels = defaultLibelleByKey.get(etape.task_key) ?? { a_faire: null, na: null };

    if (isNa) {
      toInsert.push({
        client_id: clientId,
        task_key: etape.task_key,
        categorie: cat,
        statut_logique: "NON_APPLICABLE",
        statut_detail: labels.na ?? "Non applicable",
      });
    } else {
      toInsert.push({
        client_id: clientId,
        task_key: etape.task_key,
        categorie: cat,
        statut_logique: "A_FAIRE",
        statut_detail: labels.a_faire ?? null,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error: e1 } = await sb.from("onboarding_tasks").insert(toInsert);
    if (e1) throw new Error(e1.message);
  }
  return { created: toInsert.length, totalTasks: etapes.length };
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

/**
 * Met à jour la caractéristique gestion_tns d'un client et, si on active le
 * TNS, crée les tâches d'onboarding TNS manquantes (Prévi TNS, Affiliation
 * TNS) — appel idempotent à `initializeOnboardingForClient`.
 *
 * Utilisé à la fois depuis la fiche client (EditableGestionTns) et depuis la
 * matrice transverse onboarding (chip TNS cliquable).
 */
export async function setGestionTns(
  clientId: string,
  value: boolean | null
) {
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ gestion_tns: value })
    .eq("id", clientId);
  if (error) throw new Error(error.message);

  // Si on active TNS, on s'assure que les tâches TNS existent
  if (value === true) {
    await initializeOnboardingForClient(clientId);
  }
}

/**
 * Met à jour l'origine d'un client + relance l'init onboarding pour ajouter
 * les tâches conditionnelles (depot_kbis_banque pour Création, confrere pour
 * Reprise). Idempotent : les tâches déjà présentes restent telles quelles.
 *
 * ⚠ Quand on passe d'une origine "Création" à "Reprise" (ou inverse), la tâche
 * obsolète (KBIS ou Confrère) reste en base ; Benjamin peut la marquer en
 * N/A à la main. Pas de suppression auto pour ne pas perdre d'historique.
 */
export async function setOrigine(clientId: string, origine: string | null) {
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ origine })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  await initializeOnboardingForClient(clientId);
}
