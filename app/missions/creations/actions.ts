"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { revalidateFinanceViews } from "@/lib/revalidate-finance";
import { requirePermission } from "@/lib/auth";

/**
 * Server actions du module Creations.
 *
 * Difference avec IR/CAA : un client n'a qu'UNE seule annee de creation
 * (one-shot). On stocke creation_annee + creation_statut directement sur
 * clients. Cf. migrations 0055 + 0056 + 0058 (creation_facturation).
 */

export type CreationStatut =
  | "a_traiter"
  | "depot_capital"
  | "inpi_en_cours"
  | "inpi_termine"
  | "actee_kbis_recu";

export type CreationFacturation = "a_facturer" | "facturee" | "sans_facture";

/**
 * Toggle la souscription d'un dossier a une annee donnee. Comme un client n'a
 * qu'UNE annee de creation max :
 *   - si pas d'annee : on l'ajoute avec statut 'a_traiter'
 *   - si annee identique deja affectee : on desouscrit (creation_annee = null,
 *     creation_statut = null)
 *   - si annee differente : on remplace l'annee (le statut courant reste)
 *
 * Renvoie le nouvel etat : true = souscrit, false = non souscrit.
 */
export async function toggleCreationSubscription(
  clientId: string,
  annee: number
): Promise<boolean> {
  await requirePermission("edit_production");
  const sb = await createClient();
  const { data: current } = await sb
    .from("clients")
    .select("creation_annee")
    .eq("id", clientId)
    .single();
  const cur = (current as { creation_annee: number | null } | null)?.creation_annee ?? null;

  if (cur === annee) {
    // Desouscription : on reset annee + statut
    const { error } = await sb
      .from("clients")
      .update({ creation_annee: null, creation_statut: null })
      .eq("id", clientId);
    if (error) throw new Error(error.message);
    revalidatePath("/missions/creations");
    return false;
  }

  // Souscription (nouvelle ou remplacement). Si jamais aucun statut courant,
  // on initialise a 'a_traiter'.
  const patch: { creation_annee: number; creation_statut?: string } = { creation_annee: annee };
  if (cur === null) patch.creation_statut = "a_traiter";

  const { error } = await sb
    .from("clients")
    .update(patch)
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/missions/creations");
  return true;
}

/**
 * Définit l'année de création (mono-valeur) via la liste déroulante.
 *   - annee = null  → désinscrit (creation_annee = null, creation_statut = null)
 *   - annee donnée  → l'affecte (statut 'a_traiter' si aucun statut courant).
 * Un dossier a AU PLUS une année de création.
 */
export async function setCreationAnnee(clientId: string, annee: number | null) {
  await requirePermission("edit_production");
  const sb = await createClient();

  if (annee === null) {
    const { error } = await sb
      .from("clients")
      .update({ creation_annee: null, creation_statut: null })
      .eq("id", clientId);
    if (error) throw new Error(error.message);
    revalidatePath("/missions/creations");
    revalidateFinanceViews();
    return;
  }

  const { data: cur } = await sb
    .from("clients")
    .select("creation_statut")
    .eq("id", clientId)
    .maybeSingle();
  const patch: { creation_annee: number; creation_statut?: string } = { creation_annee: annee };
  if ((cur as { creation_statut: string | null } | null)?.creation_statut == null) {
    patch.creation_statut = "a_traiter";
  }
  const { error } = await sb.from("clients").update(patch).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/missions/creations");
  revalidateFinanceViews();
}

/**
 * Set le statut creation pour un dossier. Le dossier doit etre souscrit (avoir
 * une creation_annee non null). Si statut = null, reset.
 *
 * Note : le trigger DB (cf. migration 0058) bascule automatiquement
 * creation_facturation a 'a_facturer' quand statut passe a 'actee_kbis_recu'.
 * On revalide donc aussi /facturation et /finance.
 */
export async function setCreationStatut(
  clientId: string,
  statut: CreationStatut | null
) {
  await requirePermission("edit_production");
  const sb = await createClient();

  // Auto-année : poser un statut sur un dossier sans année de création lui
  // coche l'année courante (sinon il resterait invisible en vue par exercice).
  const patch: { creation_statut: CreationStatut | null; creation_annee?: number } = {
    creation_statut: statut,
  };
  if (statut !== null) {
    const { data: cur } = await sb
      .from("clients")
      .select("creation_annee")
      .eq("id", clientId)
      .maybeSingle();
    if ((cur as { creation_annee: number | null } | null)?.creation_annee == null) {
      patch.creation_annee = new Date().getFullYear();
    }
  }

  const { error } = await sb.from("clients").update(patch).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/missions/creations");
  revalidateFinanceViews();
}

/**
 * Bulk : applique le meme creation_statut a plusieurs dossiers d'un coup.
 * Utilise par la BulkActionBar quand l'utilisateur a selectionne plusieurs
 * lignes et choisit un statut.
 */
export async function bulkSetCreationStatut(
  clientIds: string[],
  statut: CreationStatut | null
) {
  await requirePermission("edit_production");
  if (clientIds.length === 0) return { updated: 0 };
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ creation_statut: statut })
    .in("id", clientIds);
  if (error) throw new Error(error.message);
  // Auto-année : les dossiers sans année reçoivent l'année courante quand on
  // leur pose un statut (sinon invisibles en vue par exercice).
  if (statut !== null) {
    await sb
      .from("clients")
      .update({ creation_annee: new Date().getFullYear() })
      .in("id", clientIds)
      .is("creation_annee", null);
  }
  revalidatePath("/missions/creations");
  revalidateFinanceViews();
  return { updated: clientIds.length };
}

/**
 * Set la facturation d'un dossier creation. Independant du statut metier :
 * permet de marquer "Facturee" ou "Sans facture" manuellement.
 *
 * Si statut = null, on reset (la prochaine bascule en KBIS reçu re-armera
 * le trigger 0058).
 */
export async function setCreationFacturation(
  clientId: string,
  facturation: CreationFacturation | null
) {
  await requirePermission("edit_facturation");
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ creation_facturation: facturation })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/missions/creations");
  revalidateFinanceViews();
}
