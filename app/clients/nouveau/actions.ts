"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Payload = {
  denomination: string;
  siren: string | null;
  forme: string | null;
  activite: string | null;
  origine: string | null;
  email: string | null;
  pipeline_statut: string;
  jour_cloture?: number | null;
  mois_cloture?: number | null;
  debut_obligations?: string | null;
  adresse_siege?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  /**
   * Dirigeant à rattacher comme contact. `prenom` + `nom` sont concaténés en DB
   * (contacts.nom = "Prénom NOM"). `civilite` requise pour générer la LDM.
   */
  interlocuteur?: {
    civilite: "M." | "Mme" | "Mlle" | null;
    prenom: string | null;
    nom: string;
    qualite: string | null;
  } | null;
};

/**
 * Crée un client à partir d'un payload :
 *  - insère la fiche
 *  - construit pappers_url + inpi_url depuis le SIREN
 *  - crée / lie un contact "interlocuteur" si fourni (dirigeant API)
 */
export async function createClientFromSiren(payload: Payload) {
  if (!payload.denomination?.trim()) throw new Error("Dénomination obligatoire");

  const sb = await createClient();

  // ---- Check anti-doublon ----
  // 1. SIREN identique (si fourni)
  if (payload.siren) {
    const { data: existing } = await sb
      .from("clients")
      .select("id, denomination")
      .eq("siren", payload.siren)
      .maybeSingle();
    if (existing) {
      throw new Error(
        `Un dossier existe déjà pour le SIREN ${payload.siren} (« ${existing.denomination} »).`
      );
    }
  }

  // 2. Dénomination identique (case-insensitive, exact match)
  const denomTrim = payload.denomination.trim();
  const { data: existingByName } = await sb
    .from("clients")
    .select("id, siren")
    .ilike("denomination", denomTrim)
    .limit(1)
    .maybeSingle();
  if (existingByName) {
    throw new Error(
      `Un dossier "${denomTrim}" existe déjà${
        existingByName.siren ? ` (SIREN ${existingByName.siren})` : ""
      }. Modifie la dénomination ou édite le dossier existant.`
    );
  }

  const pappers_url = payload.siren ? `https://www.pappers.fr/entreprise/${payload.siren}` : null;
  const inpi_url = payload.siren ? `https://data.inpi.fr/entreprises/${payload.siren}` : null;

  const { data: created, error } = await sb
    .from("clients")
    .insert({
      denomination: payload.denomination,
      siren: payload.siren,
      forme: payload.forme,
      activite: payload.activite,
      origine: payload.origine,
      email: payload.email,
      pipeline_statut: payload.pipeline_statut,
      pappers_url,
      inpi_url,
      jour_cloture: payload.jour_cloture ?? null,
      mois_cloture: payload.mois_cloture ?? null,
      debut_obligations: payload.debut_obligations ?? undefined,
      adresse_siege: payload.adresse_siege ?? null,
      code_postal: payload.code_postal ?? null,
      ville: payload.ville ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const clientId = created.id;

  // Lien contact si fourni
  if (payload.interlocuteur?.nom?.trim()) {
    const nomFamille = payload.interlocuteur.nom.trim();
    const prenom = payload.interlocuteur.prenom?.trim() ?? "";
    // Format DB : "Prénom NOM" en un seul champ. Le générateur LDM split
    // sur le premier espace pour retrouver prénom / nom.
    const nomComplet = prenom ? `${prenom} ${nomFamille}` : nomFamille;
    const civilite = payload.interlocuteur.civilite ?? null;
    const role = payload.interlocuteur.qualite ?? null;

    // Réutilise le contact s'il existe déjà (même nom complet)
    const { data: existing } = await sb
      .from("contacts")
      .select("id, civilite")
      .eq("nom", nomComplet)
      .maybeSingle();

    let contactId: string;
    if (existing) {
      contactId = existing.id;
      // Si la civilité n'était pas connue, on la met à jour avec celle saisie
      if (!existing.civilite && civilite) {
        await sb.from("contacts").update({ civilite }).eq("id", contactId);
      }
    } else {
      const { data: inserted, error: e2 } = await sb
        .from("contacts")
        .insert({ nom: nomComplet, civilite })
        .select("id")
        .single();
      if (e2) throw new Error(e2.message);
      contactId = inserted.id;
    }

    await sb
      .from("client_contacts")
      .insert({ client_id: clientId, contact_id: contactId, role });
  }

  revalidatePath("/clients");
  return { id: clientId };
}
