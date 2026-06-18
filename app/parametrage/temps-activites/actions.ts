"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

/**
 * Gestion de la liste des activités proposées à la saisie des temps
 * (table time_activites, cf. migration 0080). Réservé à edit_parametrage.
 *
 * Supprimer une activité ne supprime PAS les saisies : activite_id passe à
 * NULL (ON DELETE SET NULL). Masquer (actif=false) la retire des propositions
 * sans toucher l'historique.
 */

export type TimeActivite = { id: string; libelle: string; ordre: number; actif: boolean };

export async function createTimeActivite(libelle: string): Promise<void> {
  await requirePermission("edit_parametrage");
  const t = libelle.trim();
  if (!t) throw new Error("Le libellé est obligatoire.");
  const sb = await createClient();
  const { data: maxRow } = await sb
    .from("time_activites")
    .select("ordre")
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordre = (maxRow?.ordre ?? 0) + 10;
  const { error } = await sb.from("time_activites").insert({ libelle: t, ordre });
  if (error) {
    if (error.code === "23505") throw new Error("Cette activité existe déjà.");
    throw new Error(error.message);
  }
  revalidatePath("/parametrage/temps-activites");
  revalidatePath("/temps");
}

export async function renameTimeActivite(id: string, libelle: string): Promise<void> {
  await requirePermission("edit_parametrage");
  const t = libelle.trim();
  if (!t) throw new Error("Le libellé est obligatoire.");
  const sb = await createClient();
  const { error } = await sb.from("time_activites").update({ libelle: t }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Cette activité existe déjà.");
    throw new Error(error.message);
  }
  revalidatePath("/parametrage/temps-activites");
  revalidatePath("/temps");
}

export async function setTimeActiviteActif(id: string, actif: boolean): Promise<void> {
  await requirePermission("edit_parametrage");
  const sb = await createClient();
  const { error } = await sb.from("time_activites").update({ actif }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametrage/temps-activites");
  revalidatePath("/temps");
}

export async function deleteTimeActivite(id: string): Promise<void> {
  await requirePermission("edit_parametrage");
  const sb = await createClient();
  const { error } = await sb.from("time_activites").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametrage/temps-activites");
  revalidatePath("/temps");
}
