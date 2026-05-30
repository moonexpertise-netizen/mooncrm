"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Server actions du module Creations.
 * Une seule colonne 'creation_statut' sur clients. Cf. migration 0055.
 */

export type CreationStatut =
  | "a_traiter"
  | "depot_capital"
  | "inpi_en_cours"
  | "inpi_termine"
  | "actee_kbis_recu";

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
  revalidatePath(`/clients`);
}
