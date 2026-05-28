"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server actions du tracker IR.
 *
 * Modele : clients_ir (personnes physiques) + ir_obligations (1 par annee
 * et par type IR/IFI). Cf. migration 0046.
 */

export type LdmStatut = "a_preparer" | "propale_acceptee" | "ldm_envoyee" | "ldm_signee";
export type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";
export type IrType = "IR" | "IFI";
export type EtatFacturation = "a_facturer" | "facturee" | "payee" | "sans_facture";

/**
 * Cree un client IR (personne physique).
 *
 * En cas d'erreur Supabase (table manquante, RLS, etc.), on logge cote
 * serveur et on jette une Error avec le message complet (code + hint).
 * En prod Next.js masque le .message des Server Actions, donc on copie
 * aussi le detail dans le message lui-meme pour qu'il remonte au toast
 * client meme en prod.
 */
export async function createClientIr(input: {
  prenom: string | null;
  nom: string;
  civilite?: "M." | "Mme" | "Mlle" | null;
  email?: string | null;
  telephone?: string | null;
}) {
  if (!input.nom?.trim()) throw new Error("Nom obligatoire");
  const sb = await createClient();
  const { data, error } = await sb
    .from("clients_ir")
    .insert({
      civilite: input.civilite ?? null,
      prenom: input.prenom?.trim() || null,
      nom: input.nom.trim(),
      email: input.email?.trim() || null,
      telephone: input.telephone?.trim() || null,
    })
    .select("id, slug")
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[createClientIr] Supabase error:", JSON.stringify(error));
    throw new Error(
      `Supabase ${error.code ?? ""} : ${error.message}${error.hint ? ` · ${error.hint}` : ""}`
    );
  }
  return data;
}

/** Met a jour un champ du client IR (saisie inline). */
export async function updateClientIr(
  clientIrId: string,
  patch: Record<string, string | number | boolean | null>
) {
  const sb = await createClient();
  const { error } = await sb.from("clients_ir").update(patch).eq("id", clientIrId);
  if (error) throw new Error(error.message);
}

/** Supprime un client IR (cascade les obligations). */
export async function deleteClientIr(clientIrId: string) {
  const sb = await createClient();
  const { error } = await sb.from("clients_ir").delete().eq("id", clientIrId);
  if (error) throw new Error(error.message);
}

/**
 * Set le statut d'une obligation IR/IFI pour une annee.
 *   - Si libelle = null  : supprime la ligne (le dossier devient N/A pour
 *     cette annee/type). Cf. pattern Notion : "N/A" = pas de souscription.
 *   - Si libelle != null : upsert (cree ou met a jour le statut).
 */
export async function setIrObligationStatut(
  clientIrId: string,
  annee: number,
  type: IrType,
  libelle: string | null
) {
  const sb = await createClient();

  // Reset / desouscription : on supprime carrement la ligne. La vue Base
  // n'affichera plus la pill pour cette annee/type.
  if (libelle === null) {
    const { error } = await sb
      .from("ir_obligations")
      .delete()
      .eq("client_ir_id", clientIrId)
      .eq("annee", annee)
      .eq("type", type);
    if (error) throw new Error(error.message);
    return;
  }

  // Trouve le statut_logique correspondant au libelle dans status_options
  let statut_logique: StatutLogique = "A_FAIRE";
  const { data: opt } = await sb
    .from("status_options")
    .select("statut_logique")
    .eq("scope", "ir")
    .eq("type_code", `${type}_ANNEE`)
    .eq("libelle", libelle)
    .maybeSingle();
  if (opt) {
    statut_logique = opt.statut_logique as StatutLogique;
  }

  const { error } = await sb
    .from("ir_obligations")
    .upsert(
      {
        client_ir_id: clientIrId,
        annee,
        type,
        statut_logique,
        statut_detail: libelle,
      },
      { onConflict: "client_ir_id,annee,type" }
    );
  if (error) throw new Error(error.message);
}

/**
 * Toggle l'inscription d'un client a une annee/type donnee depuis la vue
 * Base (pills annees). Si la ligne existe, on la supprime (= N/A). Sinon
 * on la cree au statut par defaut "A faire".
 *
 * Renvoie l'etat apres operation : true = souscrit, false = N/A.
 */
export async function toggleIrSubscription(
  clientIrId: string,
  annee: number,
  type: IrType
): Promise<boolean> {
  const sb = await createClient();

  const { data: existing } = await sb
    .from("ir_obligations")
    .select("id")
    .eq("client_ir_id", clientIrId)
    .eq("annee", annee)
    .eq("type", type)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("ir_obligations")
      .delete()
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return false;
  }

  // Cherche le libelle "A faire" pour ce type
  const { data: defOpt } = await sb
    .from("status_options")
    .select("libelle")
    .eq("scope", "ir")
    .eq("type_code", `${type}_ANNEE`)
    .eq("statut_logique", "A_FAIRE")
    .limit(1)
    .maybeSingle();

  const { error } = await sb.from("ir_obligations").insert({
    client_ir_id: clientIrId,
    annee,
    type,
    statut_logique: "A_FAIRE",
    statut_detail: defOpt?.libelle ?? "À faire",
  });
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Set le statut facturation pour une annee donnee. Comme la facturation est
 * conceptuellement liee a l'annee (pas au type IR/IFI), on met a jour TOUTES
 * les obligations IR/IFI existantes pour ce client+annee. Si une seule existe
 * (juste IR ou juste IFI), seule celle-la est mise a jour.
 *
 * etat = null : reset la facturation a "non decide".
 */
export async function setIrFacturation(
  clientIrId: string,
  annee: number,
  etat: EtatFacturation | null
) {
  const sb = await createClient();
  const { error } = await sb
    .from("ir_obligations")
    .update({ etat_facturation: etat })
    .eq("client_ir_id", clientIrId)
    .eq("annee", annee);
  if (error) throw new Error(error.message);
}
