"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server actions du tracker CAA (Commissaire aux Apports).
 * Modele : clients_caa + caa_obligations. Cf. migration 0046.
 */

export type LdmStatut = "a_preparer" | "propale_acceptee" | "ldm_envoyee" | "ldm_signee";
export type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

export async function createClientCaa(input: {
  denomination: string;
  siren?: string | null;
  forme?: string | null;
  dirigeant_nom?: string | null;
  dirigeant_email?: string | null;
  dirigeant_telephone?: string | null;
}) {
  if (!input.denomination?.trim()) throw new Error("Denomination obligatoire");
  const sb = await createClient();
  const { data, error } = await sb
    .from("clients_caa")
    .insert({
      denomination: input.denomination.trim(),
      siren: input.siren?.trim() || null,
      forme: input.forme?.trim() || null,
      dirigeant_nom: input.dirigeant_nom?.trim() || null,
      dirigeant_email: input.dirigeant_email?.trim() || null,
      dirigeant_telephone: input.dirigeant_telephone?.trim() || null,
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateClientCaa(
  clientCaaId: string,
  patch: Record<string, string | number | boolean | null>
) {
  const sb = await createClient();
  const { error } = await sb.from("clients_caa").update(patch).eq("id", clientCaaId);
  if (error) throw new Error(error.message);
}

export async function deleteClientCaa(clientCaaId: string) {
  const sb = await createClient();
  const { error } = await sb.from("clients_caa").delete().eq("id", clientCaaId);
  if (error) throw new Error(error.message);
}

/**
 * Set le statut de la mission CAA pour une annee.
 *   - Si libelle = null  : supprime la ligne (le dossier devient N/A pour
 *     cette annee). Cf. pattern Notion : "N/A" = pas de souscription.
 *   - Sinon : upsert.
 */
export async function setCaaObligationStatut(
  clientCaaId: string,
  annee: number,
  libelle: string | null
) {
  const sb = await createClient();

  if (libelle === null) {
    const { error } = await sb
      .from("caa_obligations")
      .delete()
      .eq("client_caa_id", clientCaaId)
      .eq("annee", annee);
    if (error) throw new Error(error.message);
    return;
  }

  let statut_logique: StatutLogique = "A_FAIRE";
  const { data: opt } = await sb
    .from("status_options")
    .select("statut_logique")
    .eq("scope", "caa")
    .eq("type_code", "CAA_ANNEE")
    .eq("libelle", libelle)
    .maybeSingle();
  if (opt) statut_logique = opt.statut_logique as StatutLogique;

  const { error } = await sb
    .from("caa_obligations")
    .upsert(
      {
        client_caa_id: clientCaaId,
        annee,
        statut_logique,
        statut_detail: libelle,
      },
      { onConflict: "client_caa_id,annee" }
    );
  if (error) throw new Error(error.message);
}

/**
 * Toggle souscription CAA d'un client pour une annee. Vue Base : pills.
 * Renvoie true si souscrit apres l'op, false si N/A.
 */
export async function toggleCaaSubscription(
  clientCaaId: string,
  annee: number
): Promise<boolean> {
  const sb = await createClient();

  const { data: existing } = await sb
    .from("caa_obligations")
    .select("id")
    .eq("client_caa_id", clientCaaId)
    .eq("annee", annee)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("caa_obligations")
      .delete()
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return false;
  }

  const { data: defOpt } = await sb
    .from("status_options")
    .select("libelle")
    .eq("scope", "caa")
    .eq("type_code", "CAA_ANNEE")
    .eq("statut_logique", "A_FAIRE")
    .limit(1)
    .maybeSingle();

  const { error } = await sb.from("caa_obligations").insert({
    client_caa_id: clientCaaId,
    annee,
    statut_logique: "A_FAIRE",
    statut_detail: defOpt?.libelle ?? "À préparer",
  });
  if (error) throw new Error(error.message);
  return true;
}
