"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Server actions du module Creations.
 *
 * Difference avec IR/CAA : un client n'a qu'UNE seule annee de creation
 * (one-shot). On stocke creation_annee + creation_statut directement sur
 * clients. Cf. migrations 0055 + 0056.
 */

export type CreationStatut =
  | "a_traiter"
  | "depot_capital"
  | "inpi_en_cours"
  | "inpi_termine"
  | "actee_kbis_recu";

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
 * Set le statut creation pour un dossier. Le dossier doit etre souscrit (avoir
 * une creation_annee non null). Si statut = null, reset.
 */
export async function setCreationStatut(
  clientId: string,
  statut: CreationStatut | null
) {
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ creation_statut: statut })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/missions/creations");
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
  if (clientIds.length === 0) return { updated: 0 };
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ creation_statut: statut })
    .in("id", clientIds);
  if (error) throw new Error(error.message);
  revalidatePath("/missions/creations");
  return { updated: clientIds.length };
}
