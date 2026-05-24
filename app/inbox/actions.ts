"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  buildClientPatch,
  buildDirigeantPatch,
  type TallyPayload,
} from "@/lib/tally-mapping";

/**
 * Rattache une réponse Tally à un client : applique les fields sur le client
 * choisi, crée/lie le contact dirigeant, avance le pipeline si applicable.
 */
export async function attachTallyResponse(responseId: string, clientId: string) {
  const sb = await createClient();

  // 1. Récupère la réponse
  const { data: response, error: e1 } = await sb
    .from("tally_responses")
    .select("payload, processed_at")
    .eq("id", responseId)
    .single();
  if (e1 || !response) throw new Error("Réponse Tally introuvable");
  if (response.processed_at) throw new Error("Cette réponse a déjà été rattachée");

  const payload = response.payload as TallyPayload;
  const fields = payload.data?.fields ?? [];

  // 2. Applique le patch sur le client
  const { patch, skipped } = buildClientPatch(fields);
  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from("clients").update(patch).eq("id", clientId);
    if (error) throw new Error(`Update client : ${error.message}`);
  }

  // 3. Crée / lie le contact dirigeant
  const dirigeant = buildDirigeantPatch(fields);
  if (dirigeant) {
    const { data: existing } = await sb
      .from("contacts")
      .select("id")
      .eq("nom", dirigeant.nom)
      .maybeSingle();
    let contactId: string;
    if (existing) {
      contactId = existing.id;
      const upd: Record<string, string | null> = {};
      if (dirigeant.email) upd.email = dirigeant.email;
      if (dirigeant.telephone) upd.telephone = dirigeant.telephone;
      if (dirigeant.civilite) upd.civilite = dirigeant.civilite;
      if (Object.keys(upd).length) await sb.from("contacts").update(upd).eq("id", contactId);
    } else {
      const { data: created, error } = await sb
        .from("contacts")
        .insert({
          nom: dirigeant.nom,
          email: dirigeant.email,
          telephone: dirigeant.telephone,
          civilite: dirigeant.civilite,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Insert contact : ${error.message}`);
      contactId = created!.id;
    }
    await sb.from("client_contacts").upsert(
      { client_id: clientId, contact_id: contactId, role: "Dirigeant" },
      { onConflict: "client_id,contact_id" }
    );
  }

  // 4. Avance le pipeline si encore en phase Tally
  const { data: cur } = await sb
    .from("clients")
    .select("pipeline_statut")
    .eq("id", clientId)
    .single();
  if (
    cur?.pipeline_statut === "1 - Tally à envoyer" ||
    cur?.pipeline_statut === "2 - Tally à compléter"
  ) {
    await sb
      .from("clients")
      .update({ pipeline_statut: "3 - PC à préparer" })
      .eq("id", clientId);
  }

  // 5. Marque la réponse comme traitée
  await sb
    .from("tally_responses")
    .update({ client_id: clientId, processed_at: new Date().toISOString() })
    .eq("id", responseId);

  revalidatePath("/inbox");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/pipeline");

  return { ok: true, fieldsApplied: Object.keys(patch).length, skipped };
}

/** Supprime une réponse Tally non rattachée (ex: spam, test). */
export async function deleteTallyResponse(responseId: string) {
  const sb = await createClient();
  const { error } = await sb.from("tally_responses").delete().eq("id", responseId);
  if (error) throw new Error(error.message);
  revalidatePath("/inbox");
}
