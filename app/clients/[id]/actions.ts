"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { filterByDebut, generateInstancesForType } from "@/lib/obligations-engine";

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
  | "Z - Interne" | "Z - Prospect perdu" | "Z - Résiliée";

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
 */
export async function setPipelineStatut(
  clientId: string,
  statut: PipelineStatut | null
) {
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ pipeline_statut: statut })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/parametrage");
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

  // Revalider tous les clients liés
  const { data: links } = await sb
    .from("client_contacts")
    .select("client_id")
    .eq("contact_id", contactId);
  for (const l of links ?? []) revalidatePath(`/clients/${l.client_id}`);
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
  revalidatePath(`/clients/${clientId}`);
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
  patch: Record<string, string | number | null>
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

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/parametrage");
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
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
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
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

