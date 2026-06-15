"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Supprime tout l'historique d'audit d'un client. Utilise par le bouton
 * "Vider l'historique" du tab Historique. La table client_audit_log a une
 * RLS qui autorise DELETE pour tous les users approuves.
 *
 * Cote UI on confirme via dialogue avant d'appeler cette action.
 */
export async function clearClientAuditLog(clientId: string, slug: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("client_audit_log")
    .delete()
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${slug}/historique`);
}
