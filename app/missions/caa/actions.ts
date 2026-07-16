"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateFinanceViews } from "@/lib/revalidate-finance";
import { requirePermission } from "@/lib/auth";

/**
 * Server actions du tracker CAA (Commissariat aux apports).
 * Modele : clients_caa + caa_obligations. Cf. migration 0046.
 */

export type LdmStatut = "a_preparer" | "propale_acceptee" | "ldm_envoyee" | "ldm_signee";
export type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";
export type EtatFacturation = "a_facturer" | "facturee" | "sans_facture";

export async function createClientCaa(input: {
  denomination: string;
  siren?: string | null;
  forme?: string | null;
  dirigeant_nom?: string | null;
  dirigeant_email?: string | null;
  dirigeant_telephone?: string | null;
}) {
  await requirePermission("edit_production");
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
  await requirePermission("edit_production");
  const sb = await createClient();
  const { error } = await sb.from("clients_caa").update(patch).eq("id", clientCaaId);
  if (error) throw new Error(error.message);
  revalidateFinanceViews();
}

export async function deleteClientCaa(clientCaaId: string) {
  await requirePermission("edit_production");
  const sb = await createClient();
  const { error } = await sb.from("clients_caa").delete().eq("id", clientCaaId);
  if (error) throw new Error(error.message);
  revalidateFinanceViews();
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
  await requirePermission("edit_production");
  const sb = await createClient();

  if (libelle === null) {
    const { error } = await sb
      .from("caa_obligations")
      .delete()
      .eq("client_caa_id", clientCaaId)
      .eq("annee", annee);
    if (error) throw new Error(error.message);
    revalidateFinanceViews();
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
  revalidateFinanceViews();
}

/**
 * Toggle souscription CAA d'un client pour une annee. Vue Base : pills.
 * Renvoie true si souscrit apres l'op, false si N/A.
 */
export async function toggleCaaSubscription(
  clientCaaId: string,
  annee: number
): Promise<boolean> {
  await requirePermission("edit_production");
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
    revalidateFinanceViews();
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
  revalidateFinanceViews();
  return true;
}

/**
 * Définit l'année CAA d'un client en MONO-valeur (liste déroulante).
 * Un client a AU PLUS une CAA :
 *   - annee = null  → supprime toute souscription CAA du client.
 *   - annee donnée  → supprime les AUTRES années puis garde/crée l'année
 *     choisie (statut 'A_FAIRE' par défaut si elle n'existait pas).
 * Note : passer d'une année à une autre supprime la ligne de l'ancienne année
 * (et son statut) — c'est voulu (une seule CAA par dossier).
 */
export async function setCaaAnnee(clientCaaId: string, annee: number | null): Promise<void> {
  await requirePermission("edit_production");
  const sb = await createClient();

  if (annee === null) {
    const { error } = await sb
      .from("caa_obligations")
      .delete()
      .eq("client_caa_id", clientCaaId);
    if (error) throw new Error(error.message);
    revalidateFinanceViews();
    return;
  }

  // Supprime les autres années (mono-année).
  const { error: delErr } = await sb
    .from("caa_obligations")
    .delete()
    .eq("client_caa_id", clientCaaId)
    .neq("annee", annee);
  if (delErr) throw new Error(delErr.message);

  // Garde l'année choisie si elle existe déjà, sinon crée-la.
  const { data: existing } = await sb
    .from("caa_obligations")
    .select("id")
    .eq("client_caa_id", clientCaaId)
    .eq("annee", annee)
    .maybeSingle();
  if (!existing) {
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
  }
  revalidateFinanceViews();
}

/**
 * Set le statut facturation CAA pour une annee donnee. La ligne caa_obligations
 * doit exister (le client doit etre souscrit a l'annee).
 * etat = null : reset.
 */
export async function setCaaFacturation(
  clientCaaId: string,
  annee: number,
  etat: EtatFacturation | null
) {
  await requirePermission("edit_facturation");
  const sb = await createClient();
  const { error } = await sb
    .from("caa_obligations")
    .update({ etat_facturation: etat })
    .eq("client_caa_id", clientCaaId)
    .eq("annee", annee);
  if (error) throw new Error(error.message);
  revalidateFinanceViews();
}

/**
 * Set le forfait d'honoraires CAA pour une annee donnee. La ligne caa_obligations
 * doit exister (le client doit etre souscrit a l'annee).
 * montant = null : reset.
 */
/**
 * Bulk : applique le meme libelle de statut a plusieurs dossiers CAA pour
 * une annee donnee. Si libelle est null, supprime les lignes (= N/A).
 * Utilise par la BulkActionBar.
 */
export async function bulkSetCaaObligationStatut(
  clientCaaIds: string[],
  annee: number,
  libelle: string | null
) {
  await requirePermission("edit_production");
  if (clientCaaIds.length === 0) return { updated: 0 };
  const sb = await createClient();

  if (libelle === null) {
    const { error } = await sb
      .from("caa_obligations")
      .delete()
      .in("client_caa_id", clientCaaIds)
      .eq("annee", annee);
    if (error) throw new Error(error.message);
    revalidateFinanceViews();
    return { updated: clientCaaIds.length };
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

  // Upsert ligne par ligne via insert ON CONFLICT - on construit les rows
  const rows = clientCaaIds.map((id) => ({
    client_caa_id: id,
    annee,
    statut_logique,
    statut_detail: libelle,
  }));
  const { error } = await sb
    .from("caa_obligations")
    .upsert(rows, { onConflict: "client_caa_id,annee" });
  if (error) throw new Error(error.message);
  revalidateFinanceViews();
  return { updated: clientCaaIds.length };
}

export async function setCaaForfait(
  clientCaaId: string,
  annee: number,
  montant: number | null
) {
  await requirePermission("edit_honoraires");
  if (montant !== null && montant < 0) throw new Error("Forfait negatif interdit");
  const sb = await createClient();
  // Update + select pour detecter le no-op silencieux (pas de souscription
  // pour ce couple client+annee).
  const { data, error } = await sb
    .from("caa_obligations")
    .update({ forfait: montant })
    .eq("client_caa_id", clientCaaId)
    .eq("annee", annee)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(
      `Impossible de saisir le forfait : le dossier n'est pas souscrit a la CAA pour ${annee}.`
    );
  }
  revalidateFinanceViews();
}
