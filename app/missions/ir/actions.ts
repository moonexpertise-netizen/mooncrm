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

/** Cree un client IR (personne physique). */
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
  if (error) throw new Error(error.message);
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
 * Set le statut d'une obligation IR/IFI pour une annee. Si la ligne n'existe
 * pas, on la cree (upsert sur la cle composite client_ir_id, annee, type).
 */
export async function setIrObligationStatut(
  clientIrId: string,
  annee: number,
  type: IrType,
  libelle: string | null
) {
  const sb = await createClient();

  // Trouve le statut_logique correspondant au libelle dans status_options
  let statut_logique: StatutLogique = "A_FAIRE";
  let statut_detail: string | null = null;
  if (libelle) {
    const { data: opt } = await sb
      .from("status_options")
      .select("statut_logique")
      .eq("scope", "ir")
      .eq("type_code", `${type}_ANNEE`)
      .eq("libelle", libelle)
      .maybeSingle();
    if (opt) {
      statut_logique = opt.statut_logique as StatutLogique;
      statut_detail = libelle;
    } else {
      // libelle inconnu : on fallback A_FAIRE
      statut_detail = libelle;
    }
  }

  const { error } = await sb
    .from("ir_obligations")
    .upsert(
      {
        client_ir_id: clientIrId,
        annee,
        type,
        statut_logique,
        statut_detail,
      },
      { onConflict: "client_ir_id,annee,type" }
    );
  if (error) throw new Error(error.message);
}
