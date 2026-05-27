"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { shouldBeNa, type ClientContext, type ConditionsNa } from "../parcours-engine";

// Critere "facturable" : meme regle que isClientBillable (lib/billable.ts).
const BILLABLE_PIPELINES = [
  "7 - LDM signée",
  "Z - Interne",
  "Z - Sous-traitance",
];

/**
 * Applique une etape d'onboarding retroactivement a tous les clients
 * facturables existants (LDM signee / interne / sous-traitance).
 *
 * Comportement :
 *   - Si la tache n'existe pas pour ce client : INSERT (A_FAIRE ou
 *     NON_APPLICABLE selon les conditions_na actuelles de l'etape).
 *   - Si la tache existe DEJA et est au statut A_FAIRE ou NON_APPLICABLE
 *     (statut "automatique") : UPDATE pour refleter les nouvelles conditions.
 *   - Si la tache existe et est EN_COURS ou TERMINE (statut humain) :
 *     ON NE TOUCHE PAS (l'utilisateur a deja agi dessus).
 *
 * Appelee apres createEtape et updateEtapeConditions sur le parcours par
 * defaut. Sur un parcours non-default : no-op (aucun client ne l'utilise).
 *
 * Idempotent : peut etre rappelee sans risque.
 */
async function syncEtapeWithExistingClients(etapeId: string) {
  const sb = await createClient();

  // 1. Lire l'etape + verifier que son parcours est is_default
  const { data: etape } = await sb
    .from("onboarding_etape")
    .select(
      "task_key, categorie, conditions_na, onboarding_parcours!inner(is_default)"
    )
    .eq("id", etapeId)
    .single();
  if (!etape) return;
  const parcoursIsDefault = (etape as unknown as {
    onboarding_parcours: { is_default: boolean };
  }).onboarding_parcours.is_default;
  if (!parcoursIsDefault) return; // pas de backfill sur parcours custom

  const taskKey = etape.task_key as string;
  const categorie = (etape.categorie as string) || "2G";
  const conditionsNa = etape.conditions_na;

  // 2. Libelles par defaut depuis status_options (A_FAIRE et NON_APPLICABLE)
  const { data: defaults } = await sb
    .from("status_options")
    .select("libelle, statut_logique")
    .eq("scope", "onboarding")
    .eq("type_code", taskKey)
    .eq("actif", true)
    .order("ordre");
  let libelleAFaire: string | null = null;
  let libelleNa: string | null = null;
  for (const d of defaults ?? []) {
    if (d.statut_logique === "A_FAIRE" && !libelleAFaire) libelleAFaire = d.libelle;
    if (d.statut_logique === "NON_APPLICABLE" && !libelleNa) libelleNa = d.libelle;
  }

  // 3. Tous les clients facturables
  const { data: clients } = await sb
    .from("clients")
    .select("id, origine, gestion_tns, forme, activite, pipeline_statut")
    .in("pipeline_statut", BILLABLE_PIPELINES);
  if (!clients || clients.length === 0) return;
  const clientIds = clients.map((c) => c.id);

  // 4. Taches existantes pour cette task_key
  const { data: existing } = await sb
    .from("onboarding_tasks")
    .select("client_id, statut_logique")
    .eq("task_key", taskKey)
    .in("client_id", clientIds);
  const existingByClient = new Map(
    (existing ?? []).map((t) => [t.client_id, t.statut_logique as string])
  );

  // 5. Calculer les operations pour chaque client
  const toInsert: Array<{
    client_id: string;
    task_key: string;
    categorie: string;
    statut_logique: "A_FAIRE" | "NON_APPLICABLE";
    statut_detail: string | null;
  }> = [];
  const toUpdate: Array<{
    client_id: string;
    statut_logique: "A_FAIRE" | "NON_APPLICABLE";
    statut_detail: string | null;
  }> = [];

  for (const c of clients) {
    const ctx: ClientContext = {
      origine: c.origine,
      gestion_tns: c.gestion_tns,
      forme: c.forme,
      activite: c.activite,
    };
    const isNa = shouldBeNa(conditionsNa, ctx);
    const targetStatut = isNa ? "NON_APPLICABLE" : "A_FAIRE";
    const targetDetail = isNa
      ? libelleNa ?? "Non applicable"
      : libelleAFaire;

    const existingStatut = existingByClient.get(c.id);
    if (existingStatut === undefined) {
      // Tache absente : INSERT
      toInsert.push({
        client_id: c.id,
        task_key: taskKey,
        categorie,
        statut_logique: targetStatut,
        statut_detail: targetDetail,
      });
    } else if (existingStatut === "A_FAIRE" || existingStatut === "NON_APPLICABLE") {
      // Tache deja la, statut automatique : UPDATE si different
      if (existingStatut !== targetStatut) {
        toUpdate.push({
          client_id: c.id,
          statut_logique: targetStatut,
          statut_detail: targetDetail,
        });
      }
    }
    // Sinon (EN_COURS / TERMINE) : on ne touche pas
  }

  // 6. Exécution des inserts
  if (toInsert.length > 0) {
    await sb.from("onboarding_tasks").insert(toInsert);
  }
  // 7. Exécution des updates (un par un car upsert ne peut pas filtrer sur statut)
  for (const u of toUpdate) {
    await sb
      .from("onboarding_tasks")
      .update({ statut_logique: u.statut_logique, statut_detail: u.statut_detail })
      .eq("client_id", u.client_id)
      .eq("task_key", taskKey)
      .in("statut_logique", ["A_FAIRE", "NON_APPLICABLE"]); // safety : ne pas ecraser EN_COURS/TERMINE
  }
}

/**
 * Server actions pour l'éditeur de parcours d'onboarding
 * (/onboarding/parametrage).
 *
 * Pas de service-role : les RLS de la migration 0040 autorisent tout user
 * approuvé à créer/modifier/supprimer parcours et étapes.
 *
 * revalidatePath sur /onboarding/* à chaque changement parce que le
 * parcours influence aussi la matrice et la liste (libellés, ordre).
 */

function revalidateOnboarding() {
  revalidatePath("/onboarding/parametrage");
  revalidatePath("/onboarding");
  revalidatePath("/onboarding/matrice");
}

// ----------------------------------------------------------------------------
// PARCOURS
// ----------------------------------------------------------------------------

export async function updateParcours(
  parcoursId: string,
  patch: { nom?: string; description?: string | null }
) {
  const sb = await createClient();
  const { error } = await sb
    .from("onboarding_parcours")
    .update(patch)
    .eq("id", parcoursId);
  if (error) throw new Error(error.message);
  revalidateOnboarding();
}

// ----------------------------------------------------------------------------
// ÉTAPES
// ----------------------------------------------------------------------------

/**
 * Slugifie un libellé en task_key technique.
 *   "Tally rempli"               → "tally_rempli"
 *   "Onboarding Pennylane réalisé" → "onboarding_pennylane_realise"
 *
 * Le task_key sert d'identifiant interne (lie l'étape aux onboarding_tasks).
 * Il n'est pas affiché à l'utilisateur.
 */
function slugifyTaskKey(libelle: string): string {
  return libelle
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks (accents)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .substring(0, 60) || "etape";
}

/**
 * Auto-génère un nom court à partir du libellé : on prend les 2 premiers
 * mots significatifs (utile par défaut, l'utilisateur peut éditer ensuite).
 *
 *   "Tally rempli"                     → "Tally"
 *   "Accès Pennylane créé"             → "Accès Pennylane"
 *   "Dépôt KBIS auprès de la banque"   → "Dépôt KBIS"
 */
function shortLabelFrom(libelle: string): string {
  const words = libelle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Étape";
  if (words.length === 1) return words[0];
  return words.slice(0, 2).join(" ");
}

/**
 * Crée une nouvelle étape à la fin du parcours (ordre = max + 1).
 * Le task_key est auto-généré depuis le libellé, avec un suffixe _2/_3/...
 * si collision dans le même parcours. Le nom_court est auto-généré aussi
 * (2 premiers mots du libellé) si non fourni.
 */
export async function createEtape(
  parcoursId: string,
  input: {
    libelle: string;
    nom_court?: string;
    description?: string | null;
  }
) {
  const sb = await createClient();

  // 1. Récupère les task_keys déjà utilisées dans ce parcours + l'ordre max
  const { data: existing } = await sb
    .from("onboarding_etape")
    .select("task_key, ordre")
    .eq("parcours_id", parcoursId);
  const usedKeys = new Set((existing ?? []).map((e) => e.task_key));
  const maxOrdre = (existing ?? []).reduce(
    (acc, e) => (e.ordre > acc ? e.ordre : acc),
    0
  );

  // 2. Slug + suffixe en cas de collision
  const base = slugifyTaskKey(input.libelle);
  let taskKey = base;
  let i = 2;
  while (usedKeys.has(taskKey)) {
    taskKey = `${base}_${i++}`;
  }

  const libelle = input.libelle.trim();
  const nomCourt = input.nom_court?.trim() || shortLabelFrom(libelle);

  const { data: inserted, error } = await sb
    .from("onboarding_etape")
    .insert({
      parcours_id: parcoursId,
      task_key: taskKey,
      libelle,
      nom_court: nomCourt,
      description: input.description ?? null,
      categorie: "2G", // défaut (la catégorie n'est plus exposée dans l'UI)
      ordre: maxOrdre + 1,
      conditions_na: [],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Backfill rétroactif : applique la nouvelle étape à tous les clients
  // facturables existants (si le parcours est is_default).
  if (inserted?.id) {
    await syncEtapeWithExistingClients(inserted.id);
  }

  revalidateOnboarding();
}

export async function updateEtape(
  etapeId: string,
  patch: {
    libelle?: string;
    nom_court?: string;
    description?: string | null;
    categorie?: string | null;
    ordre?: number;
  }
) {
  const sb = await createClient();
  const { error } = await sb
    .from("onboarding_etape")
    .update(patch)
    .eq("id", etapeId);
  if (error) throw new Error(error.message);
  revalidateOnboarding();
}

export async function deleteEtape(etapeId: string) {
  const sb = await createClient();
  const { error } = await sb.from("onboarding_etape").delete().eq("id", etapeId);
  if (error) throw new Error(error.message);
  revalidateOnboarding();
}

/**
 * Réordonne complètement les étapes d'un parcours en une seule opération.
 * `orderedIds` = liste des etape.id dans l'ordre voulu (1, 2, 3, …).
 *
 * Implémentation simple : un UPDATE par étape. Sur 13 étapes c'est OK.
 */
export async function reorderEtapes(parcoursId: string, orderedIds: string[]) {
  const sb = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb
      .from("onboarding_etape")
      .update({ ordre: i + 1 })
      .eq("id", orderedIds[i])
      .eq("parcours_id", parcoursId);
    if (error) throw new Error(error.message);
  }
  revalidateOnboarding();
}

// ----------------------------------------------------------------------------
// CONDITIONS DE N/A
// ----------------------------------------------------------------------------

/**
 * Remplace la liste complète des conditions_na d'une étape.
 * Plus simple que des opérations granulaires (add/remove un élément),
 * et la liste reste petite (3-5 conditions max en pratique).
 */
export async function updateEtapeConditions(
  etapeId: string,
  conditions: ConditionsNa
) {
  const sb = await createClient();
  const { error } = await sb
    .from("onboarding_etape")
    .update({ conditions_na: conditions })
    .eq("id", etapeId);
  if (error) throw new Error(error.message);

  // Re-evalue les taches existantes des clients : celles au statut auto
  // (A_FAIRE / NON_APPLICABLE) basculent selon les nouvelles conditions.
  // Les taches EN_COURS / TERMINE restent intactes (action humaine).
  await syncEtapeWithExistingClients(etapeId);

  revalidateOnboarding();
}

/**
 * Déplace une étape :
 *   - vers une autre rubrique (rubrique_id) ou hors rubrique (null)
 *   - à une position donnée parmi les étapes de la rubrique cible
 *
 * On recalcule les `ordre` de toutes les étapes du parcours pour rester
 * propre (1, 2, 3, ...) — léger pour < 50 étapes au total.
 */
export async function moveEtape(
  parcoursId: string,
  etapeId: string,
  targetRubriqueId: string | null,
  targetIndex: number
) {
  const sb = await createClient();

  // 1. Charge toutes les étapes du parcours, triées
  const { data: all } = await sb
    .from("onboarding_etape")
    .select("id, rubrique_id, ordre")
    .eq("parcours_id", parcoursId)
    .order("ordre", { ascending: true });
  if (!all) return;

  // 2. Sépare en (a) sans rubrique (rubrique_id=null) et (b) par rubrique
  // On va reconstruire la liste cible en plaçant `etapeId` à `targetIndex`
  // dans la liste des étapes de `targetRubriqueId`.
  const target = all
    .filter((e) => e.rubrique_id === targetRubriqueId && e.id !== etapeId)
    .map((e) => e.id);
  target.splice(targetIndex, 0, etapeId);

  // 3. Construit la liste finale de toutes les étapes du parcours dans le bon ordre.
  //    Convention : on garde les autres rubriques telles quelles (mêmes étapes),
  //    on remplace seulement la rubrique cible. Pour reconstituer l'ordre global :
  //    on suit l'ordre des rubriques (par leur `ordre`), avec les étapes "sans rubrique"
  //    en tête.
  const { data: rubriques } = await sb
    .from("onboarding_rubrique")
    .select("id, ordre")
    .eq("parcours_id", parcoursId)
    .order("ordre", { ascending: true });

  const orderedRubIds: Array<string | null> = [null, ...(rubriques ?? []).map((r) => r.id)];

  const fullOrder: string[] = [];
  for (const rubId of orderedRubIds) {
    if (rubId === targetRubriqueId) {
      // utilise la liste cible (qui contient déjà l'étape déplacée)
      fullOrder.push(...target);
    } else {
      // sinon, étapes existantes dans cette rubrique, sans l'étape déplacée
      const ids = all
        .filter((e) => e.rubrique_id === rubId && e.id !== etapeId)
        .map((e) => e.id);
      fullOrder.push(...ids);
    }
  }

  // 4. Update : ordre + rubrique_id pour l'étape déplacée, ordre seul pour le reste
  for (let i = 0; i < fullOrder.length; i++) {
    const id = fullOrder[i];
    const patch: { ordre: number; rubrique_id?: string | null } = { ordre: i + 1 };
    if (id === etapeId) patch.rubrique_id = targetRubriqueId;
    const { error } = await sb
      .from("onboarding_etape")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  revalidateOnboarding();
}

// ----------------------------------------------------------------------------
// RUBRIQUES
// ----------------------------------------------------------------------------

export async function createRubrique(
  parcoursId: string,
  input: { nom: string; numbering_style?: string; numbering_reset?: boolean }
) {
  const sb = await createClient();
  const { data: last } = await sb
    .from("onboarding_rubrique")
    .select("ordre")
    .eq("parcours_id", parcoursId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdre = (last?.ordre ?? 0) + 1;

  const { error } = await sb.from("onboarding_rubrique").insert({
    parcours_id: parcoursId,
    nom: input.nom.trim() || "Rubrique",
    ordre: nextOrdre,
    numbering_style: input.numbering_style ?? "decimal",
    numbering_reset: input.numbering_reset ?? false,
  });
  if (error) throw new Error(error.message);
  revalidateOnboarding();
}

export async function updateRubrique(
  rubriqueId: string,
  patch: {
    nom?: string;
    numbering_style?: string;
    numbering_reset?: boolean;
  }
) {
  const sb = await createClient();
  const { error } = await sb
    .from("onboarding_rubrique")
    .update(patch)
    .eq("id", rubriqueId);
  if (error) throw new Error(error.message);
  revalidateOnboarding();
}

/**
 * Supprime une rubrique. Les étapes associées passent à rubrique_id=null
 * (clause ON DELETE SET NULL côté DB).
 */
export async function deleteRubrique(rubriqueId: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("onboarding_rubrique")
    .delete()
    .eq("id", rubriqueId);
  if (error) throw new Error(error.message);
  revalidateOnboarding();
}

export async function reorderRubriques(parcoursId: string, orderedIds: string[]) {
  const sb = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb
      .from("onboarding_rubrique")
      .update({ ordre: i + 1 })
      .eq("id", orderedIds[i])
      .eq("parcours_id", parcoursId);
    if (error) throw new Error(error.message);
  }
  revalidateOnboarding();
}
