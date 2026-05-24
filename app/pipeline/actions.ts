"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PipelineStatut } from "@/app/clients/[id]/actions";

/**
 * Change le statut pipeline d'un client (drag-drop Kanban).
 */
export async function movePipeline(clientId: string, statut: PipelineStatut) {
  const sb = await createClient();
  const { error } = await sb
    .from("clients")
    .update({ pipeline_statut: statut })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/parametrage");
}
