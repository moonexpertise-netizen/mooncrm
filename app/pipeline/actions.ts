"use server";

import { createClient } from "@/lib/supabase/server";
import type { PipelineStatut } from "@/app/clients/[slug]/actions";

/**
 * Change le statut pipeline d'un client (drag-drop Kanban).
 *
 * IMPORTANT — performance : on ne fait AUCUN revalidatePath ici.
 * - Le client a déjà appliqué l'optimistic update (setLocalCards) → l'UI est
 *   à jour instantanément.
 * - Les autres pages (/clients, /parametrage, fiche client) sont déclarées
 *   `force-dynamic` et refetcheront naturellement la prochaine fois qu'on
 *   y navigue.
 * - Revalider 4 paths à chaque drag-drop ralentissait dramatiquement le
 *   Kanban (re-render serveur complet à chaque move).
 */
export async function movePipeline(clientId: string, statut: PipelineStatut) {
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ pipeline_statut: statut })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
}
