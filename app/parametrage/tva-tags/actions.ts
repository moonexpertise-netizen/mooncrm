"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

/**
 * Server actions pour la gestion des etiquettes TVA (tva_tags).
 *
 * Modele :
 *   - tva_tags        : table CRUD libre (label, color, ordre, actif)
 *   - clients.tva_tag_id : FK 1-1 vers tva_tags (un client = un seul tag)
 *   - clients.tva_echeance_jour : jour 1..31 ou NULL (default 24 cote UI)
 *
 * Cf. migration 0059.
 */

export type TvaTagColor =
  | "zinc"
  | "sky"
  | "emerald"
  | "amber"
  | "violet"
  | "rose"
  | "teal"
  | "indigo";

export type TvaTag = {
  id: string;
  label: string;
  color: TvaTagColor;
  ordre: number;
  actif: boolean;
};

const COLORS: TvaTagColor[] = [
  "zinc",
  "sky",
  "emerald",
  "amber",
  "violet",
  "rose",
  "teal",
  "indigo",
];

function isValidColor(c: string): c is TvaTagColor {
  return (COLORS as readonly string[]).includes(c);
}

// ============================================================================
//  CRUD tva_tags
// ============================================================================

export async function createTvaTag(label: string, color: TvaTagColor = "zinc"): Promise<TvaTag> {
  await requirePermission("edit_parametrage");
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Le libellé est obligatoire");
  if (!isValidColor(color)) throw new Error("Couleur invalide");
  const sb = await createClient();

  // Calcul ordre = max(ordre) + 1 pour mettre les nouveaux a la fin
  const { data: maxRow } = await sb
    .from("tva_tags")
    .select("ordre")
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordre = (maxRow?.ordre ?? -1) + 1;

  const { data, error } = await sb
    .from("tva_tags")
    .insert({ label: trimmed, color, ordre })
    .select("id, label, color, ordre, actif")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Ce libellé existe déjà");
    throw new Error(error.message);
  }
  revalidatePath("/parametrage/tva-tags");
  revalidatePath("/obligations/tva-mensuelle");
  return data as TvaTag;
}

export async function renameTvaTag(id: string, label: string): Promise<void> {
  await requirePermission("edit_parametrage");
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Le libellé est obligatoire");
  const sb = await createClient();
  const { error } = await sb.from("tva_tags").update({ label: trimmed }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Ce libellé existe déjà");
    throw new Error(error.message);
  }
  revalidatePath("/parametrage/tva-tags");
  revalidatePath("/obligations/tva-mensuelle");
}

export async function setTvaTagColor(id: string, color: TvaTagColor): Promise<void> {
  await requirePermission("edit_parametrage");
  if (!isValidColor(color)) throw new Error("Couleur invalide");
  const sb = await createClient();
  const { error } = await sb.from("tva_tags").update({ color }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametrage/tva-tags");
  revalidatePath("/obligations/tva-mensuelle");
}

export async function setTvaTagActif(id: string, actif: boolean): Promise<void> {
  await requirePermission("edit_parametrage");
  const sb = await createClient();
  const { error } = await sb.from("tva_tags").update({ actif }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametrage/tva-tags");
  revalidatePath("/obligations/tva-mensuelle");
}

/**
 * Supprime un tag. clients.tva_tag_id passe automatiquement a NULL (ON DELETE
 * SET NULL cf. migration 0059) -> aucun client n'est casse. On informe quand
 * meme du nombre de dossiers detaches pour transparence.
 */
export async function deleteTvaTag(id: string): Promise<{ detached: number }> {
  await requirePermission("edit_parametrage");
  const sb = await createClient();
  const { count } = await sb
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("tva_tag_id", id);
  const { error } = await sb.from("tva_tags").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametrage/tva-tags");
  revalidatePath("/obligations/tva-mensuelle");
  return { detached: count ?? 0 };
}

/**
 * Reordonne les tags. Prend un tableau d'ids dans l'ordre souhaite.
 * Met a jour le champ ordre par batch.
 */
export async function reorderTvaTags(orderedIds: string[]): Promise<void> {
  await requirePermission("edit_parametrage");
  if (orderedIds.length === 0) return;
  const sb = await createClient();
  // Update 1 par 1 (pas de bulk avec valeurs differentes en Supabase REST sans RPC).
  // Acceptable car nombre de tags reste petit (< 20 typiquement).
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb.from("tva_tags").update({ ordre: i }).eq("id", orderedIds[i]);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/parametrage/tva-tags");
  revalidatePath("/obligations/tva-mensuelle");
}

// ============================================================================
//  Assignation client <-> tag / echeance jour
// ============================================================================

export async function setClientTvaTag(clientId: string, tagId: string | null): Promise<void> {
  await requirePermission("edit_parametrage");
  const sb = await createClient();
  const { error } = await sb.from("clients").update({ tva_tag_id: tagId }).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/obligations/tva-mensuelle");
  revalidatePath(`/clients`); // listing
  // Note : on ne revalide pas /clients/[slug] specifiquement car on n'a pas le slug ici.
  // Le router.refresh() cote client (apres mutation) le couvre.
}

export async function setClientTvaEcheanceJour(clientId: string, jour: number | null): Promise<void> {
  await requirePermission("edit_parametrage");
  if (jour !== null && (jour < 1 || jour > 31 || !Number.isInteger(jour))) {
    throw new Error("Le jour doit etre un entier entre 1 et 31");
  }
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ tva_echeance_jour: jour })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/obligations/tva-mensuelle");
}
