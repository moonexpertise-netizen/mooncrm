"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revalidateFinanceViews } from "@/lib/revalidate-finance";
import { filterByDebut, generateInstancesForType } from "@/lib/obligations-engine";
import { getInpiCompany, InpiError } from "@/lib/inpi";

export type TypeObligation =
  | "TVA_MENSUELLE" | "TVA_TRIMESTRIELLE" | "TVA_ANNUELLE_CA12" | "TVA_NON_SOUMIS"
  | "TVS"
  | "IS_ACOMPTE" | "IS_SOLDE"
  | "CVAE" | "CVAE_ACOMPTE"
  | "CFE"
  | "DAS2" | "DECL_2561" | "DECL_2777" | "OSS" | "DES"
  | "COMPTA" | "LIASSE_PLAQUETTE" | "AGO_DEPOT" | "DEPOT_COMPTES"
  | "FACTURATION_JUR" | "ETAT_CREATION";

export type Regime = "IR" | "IS";
export type PipelineStatut =
  | "1 - Tally à envoyer" | "2 - Tally à compléter"
  | "3 - PC à préparer" | "4 - PC envoyée" | "5 - PC acceptée"
  | "6 - LDM envoyée" | "7 - LDM signée"
  | "Z - Interne" | "Z - Sous-traitance"
  | "Z - Prospect perdu" | "Z - Résiliée"
  | "Z - Perdu dans l'espace";

// ---------------------------------------------------------------------------
// MOTEUR D'OBLIGATIONS · génération idempotente des instances pour une année
// ---------------------------------------------------------------------------

/**
 * Régénère les instances d'obligations pour toutes les subs actives d'un client
 * sur une année donnée. Idempotent : crée les instances manquantes sans toucher
 * aux statuts ou aux échéances des instances déjà présentes (`ignoreDuplicates`
 * sur le couple `(subscription_id, periode)`).
 */
export async function regenerateObligationsForYear(clientId: string, annee: number) {
  const sb = await createClient();

  const [{ data: client }, { data: subs }] = await Promise.all([
    sb.from("clients").select("jour_cloture, mois_cloture, debut_obligations").eq("id", clientId).single(),
    sb.from("obligation_subscriptions").select("id, type, annee").eq("client_id", clientId).eq("annee", annee).eq("actif", true),
  ]);
  if (!client || !subs?.length) {
    revalidatePath(`/clients/${clientId}`);
    return { inserted: 0, updated: 0 };
  }

  // 1. Une seule requête pour TOUS les obligations existantes des subs concernées
  const subIds = subs.map((s) => s.id);
  const { data: existing } = await sb
    .from("obligations")
    .select("id, subscription_id, periode, echeance")
    .in("subscription_id", subIds);
  const existingMap = new Map<string, { id: string; periode: string; echeance: string | null }>();
  for (const e of existing ?? []) existingMap.set(`${e.subscription_id}|${e.periode}`, e);

  // 2. Calcule tous les inserts + updates en mémoire
  const toInsertAll: Array<Record<string, unknown>> = [];
  const toUpdate: Array<{ id: string; echeance: string | null }> = [];

  for (const sub of subs) {
    const instances = filterByDebut(
      generateInstancesForType(
        sub.type as TypeObligation,
        sub.annee,
        { jour_cloture: client.jour_cloture, mois_cloture: client.mois_cloture }
      ),
      client.debut_obligations
    );
    for (const i of instances) {
      const key = `${sub.id}|${i.periode}`;
      const ex = existingMap.get(key);
      if (ex) {
        if (ex.echeance !== i.echeance) toUpdate.push({ id: ex.id, echeance: i.echeance });
      } else {
        toInsertAll.push({
          subscription_id: sub.id,
          client_id: clientId,
          type: sub.type,
          periode: i.periode,
          annee: i.annee,
          echeance: i.echeance,
        });
      }
    }
  }

  // 3. Exécution parallèle : 1 INSERT en bloc + tous les UPDATE en parallèle
  await Promise.all([
    toInsertAll.length ? sb.from("obligations").insert(toInsertAll) : Promise.resolve(),
    ...toUpdate.map((u) =>
      sb.from("obligations").update({ echeance: u.echeance }).eq("id", u.id)
    ),
  ]);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/parametrage");
  return { inserted: toInsertAll.length, updated: toUpdate.length };
}

/**
 * Définit le régime fiscal IR/IS pour un client sur une année donnée.
 * Stocké dans client_year_config (régime par exercice · un client peut
 * basculer IR -> IS d'une année à l'autre).
 * Effets automatiques :
 *   · IR → désactive IS_ACOMPTE + IS_SOLDE
 *   · IS → active IS_ACOMPTE + IS_SOLDE (toujours obligatoires en IS, plus
 *          exposés à l'utilisateur dans le paramétrage)
 */
export async function setRegime(clientId: string, annee: number, regime: Regime | null) {
  const sb = await createClient();

  const { error } = await sb
    .from("client_year_config")
    .upsert(
      { client_id: clientId, annee, regime },
      { onConflict: "client_id,annee" }
    );
  if (error) throw new Error(error.message);

  if (regime === "IR") {
    // IR : désactive tout ce qui relève de l'IS (acomptes + solde)
    const { error: e2 } = await sb
      .from("obligation_subscriptions")
      .update({ actif: false })
      .eq("client_id", clientId)
      .eq("annee", annee)
      .in("type", ["IS_ACOMPTE", "IS_SOLDE"]);
    if (e2) throw new Error(e2.message);
  } else if (regime === "IS") {
    // IS : Solde IS + Acomptes IS toujours actifs (plus exposés dans l'UI).
    await activateSubInternal(clientId, "IS_SOLDE", annee);
    await activateSubInternal(clientId, "IS_ACOMPTE", annee);
  }

  await regenerateObligationsForYear(clientId, annee);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/parametrage");
}

/**
 * Initialise une nouvelle année pour un client : si aucune sub n'existe encore,
 * coche DAS2 et CFE par défaut (obligations applicables à tout dossier signé).
 * Appelée quand l'utilisateur ouvre une année qui n'a jamais été paramétrée
 * (via le bouton "+ N+1" du YearSwitcher).
 */
export async function initializeYear(clientId: string, annee: number) {
  const sb = await createClient();

  const { data: existing, error } = await sb
    .from("obligation_subscriptions")
    .select("id")
    .eq("client_id", clientId)
    .eq("annee", annee)
    .limit(1);
  if (error) throw new Error(error.message);

  // Si l'année a déjà des subs (même soft-deletées), on ne fait rien : c'est
  // pas une "nouvelle" année.
  if (existing && existing.length > 0) return;

  await activateSubInternal(clientId, "DAS2", annee);
  await activateSubInternal(clientId, "CFE", annee);
  await regenerateObligationsForYear(clientId, annee);
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Active (ou crée) une sub idempotente. Helper interne, ne revalide pas
 * (laissé à l'appelant).
 */
async function activateSubInternal(clientId: string, type: TypeObligation, annee: number) {
  const sb = await createClient();
  const { data: existing, error: e0 } = await sb
    .from("obligation_subscriptions")
    .select("id, actif")
    .eq("client_id", clientId)
    .eq("type", type)
    .eq("annee", annee)
    .maybeSingle();
  if (e0) throw new Error(e0.message);

  if (existing) {
    if (!existing.actif) {
      const { error } = await sb
        .from("obligation_subscriptions")
        .update({ actif: true })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
  } else {
    const { error } = await sb
      .from("obligation_subscriptions")
      .insert({ client_id: clientId, type, annee, actif: true });
    if (error) throw new Error(error.message);
  }
}

/**
 * Met à jour le statut pipeline du client (client-level, pas par année).
 *
 * Auto-sync Pipeline ↔ Origine :
 *   pipeline 'Z - Interne'         → origine '4 - Interne'
 *   pipeline 'Z - Sous-traitance'  → origine '5 - Sous-traitance'
 *
 * On ne touche à l'origine que si elle est vide ou incohérente avec le
 * nouveau pipeline (pour ne pas écraser un choix manuel de Benjamin sur
 * un dossier qui passerait temporairement par un état Z).
 */
/**
 * Signature LDM "all-in-one" : enregistre la date du jour, bascule le
 * pipeline a "7 - LDM signee", initialise l'onboarding (idempotent),
 * et renvoie les stats MRR avant/apres pour l'achievement card.
 *
 * Calcul MRR du cabinet :
 *   - mrrBefore : somme des mrr des clients deja en LDM signee
 *   - mrrClient : mrr du client qu'on signe (genere par trigger DB)
 *   - mrrAfter  : mrrBefore + mrrClient
 *
 * Renvoie aussi le nom du client et l'origine pour personnaliser
 * l'affichage.
 *
 * Idempotent partiel : si le client est deja signe, on relance juste
 * les confettis cote UI (handled par l'appelant) sans toucher mois_signature
 * existant. Mais l'action est appelee uniquement quand pas deja signe
 * (le bouton fait ce check cote UI).
 */
export async function signLdmAndGetStats(clientId: string): Promise<{
  client: { denomination: string; origine: string | null; mrr: number; arr: number };
  mrrBefore: number;
  mrrAfter: number;
  arrBefore: number;
  arrAfter: number;
}> {
  const sb = await createClient();

  // 1. Snapshot du client AVANT (mrr, arr, denomination, origine)
  const { data: client, error: eClient } = await sb
    .from("clients")
    .select("denomination, origine, mrr, arr")
    .eq("id", clientId)
    .single();
  if (eClient) throw new Error(eClient.message);
  const clientMrr = client.mrr ?? 0;
  const clientArr = client.arr ?? 0;

  // 2. MRR total du cabinet AVANT (clients deja signes uniquement -
  //    coherent avec dashboard-data.ts qui ne compte plus Interne / ST)
  const { data: signed } = await sb
    .from("clients")
    .select("mrr, arr")
    .eq("pipeline_statut", "7 - LDM signée");
  const mrrBefore = (signed ?? []).reduce((s, c) => s + (c.mrr ?? 0), 0);
  const arrBefore = (signed ?? []).reduce((s, c) => s + (c.arr ?? 0), 0);

  // 3. Mutation : date + pipeline + onboarding init en parallele
  const today = new Date().toISOString().substring(0, 10);
  const { initializeOnboardingForClient } = await import(
    "@/app/onboarding/actions"
  );
  await Promise.all([
    sb
      .from("clients")
      .update({ mois_signature: today, pipeline_statut: "7 - LDM signée" })
      .eq("id", clientId)
      .then(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    initializeOnboardingForClient(clientId),
  ]);

  return {
    client: {
      denomination: client.denomination,
      origine: client.origine,
      mrr: clientMrr,
      arr: clientArr,
    },
    mrrBefore,
    mrrAfter: mrrBefore + clientMrr,
    arrBefore,
    arrAfter: arrBefore + clientArr,
  };
}

/**
 * Stats renvoyees quand setPipelineStatut declenche une PREMIERE signature
 * LDM (transition prospect -> "7 - LDM signee"). Permet au client de
 * declencher confettis + achievement card de maniere unifiee, qu'on vienne
 * du bouton "LDM signee", du PipelinePicker (radio pills), ou du drag
 * dans le kanban.
 */
export type SignatureStats = {
  client: { denomination: string; origine: string | null; mrr: number; arr: number };
  mrrBefore: number;
  mrrAfter: number;
  arrBefore: number;
  arrAfter: number;
};

export async function setPipelineStatut(
  clientId: string,
  statut: PipelineStatut | null
): Promise<{ signature: SignatureStats | null }> {
  const sb = await createClient();

  // Lit l'etat AVANT pour pouvoir detecter une transition vers LDM signee.
  // Si on passe DE != LDM signee VERS LDM signee, on declenche la procedure
  // signature (date + onboarding + stats MRR).
  const { data: before } = await sb
    .from("clients")
    .select("pipeline_statut, origine, denomination, mrr, arr, mois_signature")
    .eq("id", clientId)
    .single();
  const wasSigned = before?.pipeline_statut === "7 - LDM signée";
  const isSigningNow = statut === "7 - LDM signée" && !wasSigned;

  const patch: {
    pipeline_statut: PipelineStatut | null;
    origine?: string;
    mois_signature?: string;
  } = {
    pipeline_statut: statut,
  };

  if (statut === "Z - Interne" || statut === "Z - Sous-traitance") {
    const targetOrigine =
      statut === "Z - Interne" ? "4 - Interne" : "5 - Sous-traitance";
    if (!before?.origine) {
      patch.origine = targetOrigine;
    }
  }

  // Si on signe maintenant : on date au jour J (sauf si deja date pour
  // preserver une date historique). Cas typique : Benjamin glisse dans
  // le pipeline vers "LDM signee" → meme effet que le bouton dedie.
  if (isSigningNow && !before?.mois_signature) {
    patch.mois_signature = new Date().toISOString().substring(0, 10);
  }

  // Si on signe, on prend un snapshot du MRR total AVANT le UPDATE pour
  // pouvoir calculer le "avant -> apres" coherent dans l'achievement card.
  let mrrBefore = 0;
  let arrBefore = 0;
  if (isSigningNow) {
    const { data: signed } = await sb
      .from("clients")
      .select("mrr, arr")
      .eq("pipeline_statut", "7 - LDM signée");
    mrrBefore = (signed ?? []).reduce((s, c) => s + (c.mrr ?? 0), 0);
    arrBefore = (signed ?? []).reduce((s, c) => s + (c.arr ?? 0), 0);
  }

  const { error } = await sb.from("clients").update(patch).eq("id", clientId);
  if (error) throw new Error(error.message);

  // Bascule sur un statut "geree" (LDM signee / Interne / Sous-traitance) :
  // on initialise l'onboarding si ce n'est pas deja fait. Idempotent.
  if (
    statut === "7 - LDM signée" ||
    statut === "Z - Interne" ||
    statut === "Z - Sous-traitance"
  ) {
    const { initializeOnboardingForClient } = await import(
      "@/app/onboarding/actions"
    );
    await initializeOnboardingForClient(clientId);
  }

  // Si signature : retourner les stats pour la celebration cote client.
  if (isSigningNow && before) {
    const clientMrr = before.mrr ?? 0;
    const clientArr = before.arr ?? 0;
    return {
      signature: {
        client: {
          denomination: before.denomination,
          origine: before.origine,
          mrr: clientMrr,
          arr: clientArr,
        },
        mrrBefore,
        mrrAfter: mrrBefore + clientMrr,
        arrBefore,
        arrAfter: arrBefore + clientArr,
      },
    };
  }
  return { signature: null };
}

/**
 * Toggle d'une obligation_subscription (soft delete).
 * - enabled = true  : upsert avec actif = true (réactive ou crée)
 * - enabled = false : update actif = false (l'historique d'obligations
 *                     est conservé, on peut réactiver à tout moment)
 */
export async function toggleSubscription(
  clientId: string,
  type: TypeObligation,
  annee: number,
  enabled: boolean
) {
  const sb = await createClient();

  // 1. existe-t-elle déjà ?
  const { data: existing, error: e0 } = await sb
    .from("obligation_subscriptions")
    .select("id")
    .eq("client_id", clientId)
    .eq("type", type)
    .eq("annee", annee)
    .maybeSingle();
  if (e0) throw new Error(e0.message);

  if (existing) {
    const { error } = await sb
      .from("obligation_subscriptions")
      .update({ actif: enabled })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else if (enabled) {
    const { error } = await sb
      .from("obligation_subscriptions")
      .insert({ client_id: clientId, type, annee, actif: true });
    if (error) throw new Error(error.message);
  }

  if (enabled) {
    await regenerateObligationsForYear(clientId, annee);
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/parametrage");
}

/**
 * Bascule le régime TVA pour une année (mutuellement exclusif).
 * Désactive (soft) les autres modes TVA, active le mode demandé.
 * L'historique des instances reste intact dans tous les cas.
 */
export async function setTvaMode(
  clientId: string,
  annee: number,
  mode: "TVA_MENSUELLE" | "TVA_TRIMESTRIELLE" | "TVA_ANNUELLE_CA12" | "TVA_NON_SOUMIS" | null
) {
  const sb = await createClient();
  const allTvaModes = [
    "TVA_MENSUELLE", "TVA_TRIMESTRIELLE", "TVA_ANNUELLE_CA12", "TVA_NON_SOUMIS",
  ];
  const toDeactivate = allTvaModes.filter((m) => m !== mode);

  // Désactiver les autres modes (soft)
  const { error: e1 } = await sb
    .from("obligation_subscriptions")
    .update({ actif: false })
    .eq("client_id", clientId)
    .eq("annee", annee)
    .in("type", toDeactivate);
  if (e1) throw new Error(e1.message);

  // Activer (ou créer) le mode demandé
  if (mode) {
    const { data: existing, error: e2 } = await sb
      .from("obligation_subscriptions")
      .select("id")
      .eq("client_id", clientId)
      .eq("type", mode)
      .eq("annee", annee)
      .maybeSingle();
    if (e2) throw new Error(e2.message);

    if (existing) {
      const { error } = await sb
        .from("obligation_subscriptions")
        .update({ actif: true })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("obligation_subscriptions")
        .insert({ client_id: clientId, type: mode, annee, actif: true });
      if (error) throw new Error(error.message);
    }
  }

  // Auto-génération des instances
  await regenerateObligationsForYear(clientId, annee);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/parametrage");
}

/**
 * Reconduit la config d'une année vers une autre en mode MIROIR.
 * L'année cible devient l'exacte copie de la source :
 *  · active en source → activée en cible
 *  · active en cible mais pas en source → désactivée (soft)
 *  · régime IR/IS aussi reporté
 * Conserve l'historique d'instances (soft delete).
 */
export async function reconduireAnnee(clientId: string, fromYear: number, toYear: number) {
  const sb = await createClient();

  // 1. Lecture en parallèle : subs source + cible + régime source
  const [{ data: source }, { data: target }, { data: cfg }] = await Promise.all([
    sb
      .from("obligation_subscriptions")
      .select("type")
      .eq("client_id", clientId)
      .eq("annee", fromYear)
      .eq("actif", true),
    sb
      .from("obligation_subscriptions")
      .select("id, type, actif")
      .eq("client_id", clientId)
      .eq("annee", toYear),
    sb
      .from("client_year_config")
      .select("regime")
      .eq("client_id", clientId)
      .eq("annee", fromYear)
      .maybeSingle(),
  ]);

  const sourceTypes = new Set((source ?? []).map((s) => s.type));
  if (sourceTypes.size === 0) return { created: 0, deactivated: 0 };

  const targetByType = new Map((target ?? []).map((t) => [t.type, t]));

  // 2. Calcul en mémoire des opérations
  const toActivateIds: string[] = [];
  const toInsert: Array<Record<string, unknown>> = [];
  for (const type of sourceTypes) {
    const ex = targetByType.get(type);
    if (ex) {
      if (!ex.actif) toActivateIds.push(ex.id);
    } else {
      toInsert.push({ client_id: clientId, type, annee: toYear, actif: true });
    }
  }
  const toDeactivateIds = (target ?? [])
    .filter((t) => t.actif && !sourceTypes.has(t.type))
    .map((t) => t.id);

  // 3. Tout en parallèle : activations, désactivations, inserts, régime
  await Promise.all([
    toActivateIds.length
      ? sb.from("obligation_subscriptions").update({ actif: true }).in("id", toActivateIds)
      : Promise.resolve(),
    toDeactivateIds.length
      ? sb.from("obligation_subscriptions").update({ actif: false }).in("id", toDeactivateIds)
      : Promise.resolve(),
    toInsert.length
      ? sb.from("obligation_subscriptions").insert(toInsert)
      : Promise.resolve(),
    cfg?.regime
      ? sb.from("client_year_config").upsert(
          { client_id: clientId, annee: toYear, regime: cfg.regime },
          { onConflict: "client_id,annee" }
        )
      : Promise.resolve(),
  ]);

  // 4. Régénération en parallèle des instances
  await regenerateObligationsForYear(clientId, toYear);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/parametrage");
  return {
    created: toActivateIds.length + toInsert.length,
    deactivated: toDeactivateIds.length,
  };
}

// ---------------------------------------------------------------------------
// CONTACTS / INTERLOCUTEURS
// ---------------------------------------------------------------------------

/**
 * Ajoute un nouveau contact au dossier. Crée l'enregistrement dans `contacts`
 * et le lien dans `client_contacts`.
 */
export async function addContactToClient(
  clientId: string,
  data: {
    nom: string;
    prenom?: string | null;
    email: string | null;
    telephone: string | null;
    role: string | null;
    civilite?: "M." | "Mme" | "Mlle" | null;
  }
) {
  if (!data.nom?.trim()) throw new Error("Nom obligatoire");
  const sb = await createClient();
  const { data: created, error } = await sb
    .from("contacts")
    .insert({
      nom: data.nom.trim(),
      prenom: data.prenom?.trim() || null,
      email: data.email?.trim() || null,
      telephone: data.telephone?.trim() || null,
      civilite: data.civilite ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: e2 } = await sb
    .from("client_contacts")
    .insert({ client_id: clientId, contact_id: created.id, role: data.role?.trim() || null });
  if (e2) throw new Error(e2.message);
  // Ajout : la fiche client doit voir le nouveau contact. force-dynamic le
  // récupère au prochain refetch côté navigation, mais on conserve pour
  // garantir l'affichage instantané (le caller n'a pas d'optimistic update
  // côté liste contacts).
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Met à jour les coordonnées d'un contact. Affecte TOUS les clients liés
 * (les contacts sont partagés).
 */
export async function updateContact(
  contactId: string,
  patch: {
    nom?: string;
    prenom?: string | null;
    email?: string | null;
    telephone?: string | null;
    civilite?: "M." | "Mme" | "Mlle" | null;
  }
) {
  const sb = await createClient();
  const clean: Record<string, string | null> = {};
  if (patch.nom !== undefined) {
    if (!patch.nom.trim()) throw new Error("Nom obligatoire");
    clean.nom = patch.nom.trim();
  }
  if (patch.prenom !== undefined) clean.prenom = patch.prenom?.trim() || null;
  if (patch.email !== undefined) clean.email = patch.email?.trim() || null;
  if (patch.telephone !== undefined) clean.telephone = patch.telephone?.trim() || null;
  if (patch.civilite !== undefined) clean.civilite = patch.civilite;
  const { error } = await sb.from("contacts").update(clean).eq("id", contactId);
  if (error) throw new Error(error.message);
  // Perf : pas de revalidatePath. Saisie inline avec optimistic update côté UI.
}

/** Met à jour le rôle de l'interlocuteur sur le dossier (lien). */
export async function updateContactRole(
  clientId: string,
  contactId: string,
  role: string | null
) {
  const sb = await createClient();
  const { error } = await sb
    .from("client_contacts")
    .update({ role: role?.trim() || null })
    .eq("client_id", clientId)
    .eq("contact_id", contactId);
  if (error) throw new Error(error.message);
  // Perf : pas de revalidatePath. Saisie inline + optimistic update.
}

/** Détache un contact d'un dossier (ne supprime pas le contact lui-même). */
export async function removeContactFromClient(clientId: string, contactId: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("client_contacts")
    .delete()
    .eq("client_id", clientId)
    .eq("contact_id", contactId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Importe des champs depuis l'annuaire des entreprises (post-création).
 * Le client passe une sélection de champs à écraser. Le dirigeant met à jour
 * le premier contact rattaché, ou en crée un nouveau si aucun contact n'existe.
 */
/**
 * Récupère la date de clôture d'exercice depuis l'API INPI RNE pour un SIREN.
 * Renvoie `null` si la donnée n'est pas dispo ou si les credentials INPI ne
 * sont pas configurés (on ne casse pas le flow Annuaire).
 *
 * Cette fonction est appelée par le bouton "Annuaire" côté client après le
 * fetch recherche-entreprises (qui, lui, n'a pas la date de clôture).
 */
export async function fetchInpiCloture(
  siren: string
): Promise<{ jour: number; mois: number } | null> {
  try {
    const data = await getInpiCompany(siren);
    return data?.cloture ?? null;
  } catch (e) {
    // Log mais ne plante pas - le bouton Annuaire fonctionne sans INPI
    if (e instanceof InpiError) {
      console.warn("INPI cloture indisponible :", e.message);
    } else {
      console.warn("INPI cloture erreur :", e);
    }
    return null;
  }
}

export async function importFromAnnuaire(
  clientId: string,
  patch: {
    adresse_siege?: string | null;
    code_postal?: string | null;
    ville?: string | null;
    activite?: string | null;
    forme?: string | null;
    jour_cloture?: number | null;
    mois_cloture?: number | null;
    dirigeant?: { prenom: string | null; nom: string };
  }
) {
  const sb = await createClient();

  // 1. Champs du client
  const clientPatch: Record<string, string | number | null> = {};
  if ("adresse_siege" in patch) clientPatch.adresse_siege = patch.adresse_siege ?? null;
  if ("code_postal" in patch) clientPatch.code_postal = patch.code_postal ?? null;
  if ("ville" in patch) clientPatch.ville = patch.ville ?? null;
  if ("activite" in patch) clientPatch.activite = patch.activite ?? null;
  if ("forme" in patch) clientPatch.forme = patch.forme ?? null;
  if ("jour_cloture" in patch) clientPatch.jour_cloture = patch.jour_cloture ?? null;
  if ("mois_cloture" in patch) clientPatch.mois_cloture = patch.mois_cloture ?? null;

  if (Object.keys(clientPatch).length > 0) {
    const { error } = await sb
      .from("clients")
      .update(clientPatch)
      .eq("id", clientId);
    if (error) throw new Error(`Update client : ${error.message}`);
  }

  // 2. Dirigeant : update du 1er contact, ou création si aucun
  if (patch.dirigeant && patch.dirigeant.nom) {
    const { data: links } = await sb
      .from("client_contacts")
      .select("contact_id")
      .eq("client_id", clientId)
      .limit(1);

    if (links?.[0]) {
      const { error } = await sb
        .from("contacts")
        .update({
          nom: patch.dirigeant.nom,
          prenom: patch.dirigeant.prenom,
        })
        .eq("id", links[0].contact_id);
      if (error) throw new Error(`Update dirigeant : ${error.message}`);
    } else {
      const { data: created, error } = await sb
        .from("contacts")
        .insert({
          nom: patch.dirigeant.nom,
          prenom: patch.dirigeant.prenom,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Création dirigeant : ${error.message}`);
      const { error: e2 } = await sb
        .from("client_contacts")
        .insert({
          client_id: clientId,
          contact_id: created.id,
          role: "Dirigeant",
        });
      if (e2) throw new Error(`Rattachement dirigeant : ${e2.message}`);
    }
  }

  revalidatePath(`/clients/${clientId}`);
}

/**
 * Supprime définitivement un dossier client et toutes ses données liées
 * (subs, obligations, onboarding, contacts). FK ON DELETE CASCADE.
 */
export async function deleteClient(clientId: string) {
  const sb = await createClient();
  const { error } = await sb.from("clients").delete().eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/clients");
  revalidatePath("/parametrage");
  revalidatePath("/obligations", "page");
}

/**
 * Met à jour des champs arbitraires de la fiche client (édition inline).
 * Le caller passe un objet partial · on transmet tel quel à Postgres.
 *
 * Effet de bord : si `debut_obligations` est dans le patch, on désactive
 * automatiquement toutes les subs dont l'année est antérieure (évite les
 * résidus historiques en /parametrage et dans la matrice).
 */
/**
 * Colonnes numériques `NOT NULL DEFAULT 0` côté DB. Si l'UI envoie null
 * (l'utilisateur a effacé le champ), on force à 0 pour ne pas casser la
 * contrainte not-null. Sémantiquement « vide » = « 0 € » pour ces honoraires.
 */
const NUMERIC_NOT_NULL = new Set([
  "honoraires_compta",
  "forfait_bilan",
  "honoraires_jur",
  "tdb_honos_periode",
  "honoraires_reprise",
  "honoraires_creation",
  "exceptionnel",
]);

export async function updateClient(
  clientId: string,
  patch: Record<string, string | number | boolean | null>
) {
  const sb = await createClient();

  // Defense : convertit null → 0 pour les colonnes numeric NOT NULL.
  for (const key of Object.keys(patch)) {
    if (NUMERIC_NOT_NULL.has(key) && patch[key] === null) {
      patch[key] = 0;
    }
  }

  const { error } = await sb.from("clients").update(patch).eq("id", clientId);
  if (error) throw new Error(error.message);

  if ("debut_obligations" in patch) {
    const debut = patch.debut_obligations;
    if (typeof debut === "string" && /^\d{4}/.test(debut)) {
      const debutYear = parseInt(debut.slice(0, 4), 10);
      if (!Number.isNaN(debutYear)) {
        await sb
          .from("obligation_subscriptions")
          .update({ actif: false })
          .eq("client_id", clientId)
          .lt("annee", debutYear)
          .eq("actif", true);
      }
    }
  }

  // Perf : pas de revalidatePath. Les pages sont force-dynamic + l'UI applique
  // déjà un optimistic update (useSaver). Revalider 3 paths à chaque keystroke
  // ralentissait massivement la saisie.
  //
  // Exception : si la patch touche un champ qui impacte /finance ou /facturation
  // (honoraires, pipeline_statut, types), on invalide ces 2 routes uniquement.
  // Cf. Router Cache Next.js : sinon le dashboard reste stale apres edit fiche.
  const FINANCE_KEYS = new Set([
    "pipeline_statut",
    "honoraires_compta",
    "honoraires_jur",
    "honoraires_creation",
    "honoraires_reprise",
    "forfait_bilan",
    "tdb_honos_periode",
    "tdb_periode",
    "type_honos_bilans",
    "type_honos_jur",
    "type_honos_creation",
    "type_honos_reprise",
  ]);
  if (Object.keys(patch).some((k) => FINANCE_KEYS.has(k))) {
    revalidateFinanceViews();
  }
}

/**
 * Crée un groupe s'il n'existe pas et l'affecte au client, ou détache.
 * Si nom = null/vide, détache le client de son groupe.
 */
export async function setClientGroupe(clientId: string, nom: string | null) {
  const sb = await createClient();

  if (!nom || !nom.trim()) {
    const { error } = await sb
      .from("clients")
      .update({ groupe_id: null })
      .eq("id", clientId);
    if (error) throw new Error(error.message);
    return;
  }

  const trimmed = nom.trim();

  // Existe-t-il déjà ?
  const { data: existing } = await sb
    .from("groupes")
    .select("id")
    .eq("nom", trimmed)
    .maybeSingle();

  let groupeId: string;
  if (existing) {
    groupeId = existing.id;
  } else {
    const { data, error } = await sb
      .from("groupes")
      .insert({ nom: trimmed })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    groupeId = data.id;
  }

  const { error: e2 } = await sb
    .from("clients")
    .update({ groupe_id: groupeId })
    .eq("id", clientId);
  if (e2) throw new Error(e2.message);
}

