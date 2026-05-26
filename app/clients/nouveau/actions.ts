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
  fin_mission_date?: string | null;
  adresse_siege?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  // Honoraires LDM — saisis à la création pour préparer la lettre de mission
  honoraires_compta?: number | null;
  forfait_bilan?: number | null;
  honoraires_jur?: number | null;
  honoraires_creation?: number | null;
  honoraires_reprise?: number | null;
  tdb_honos_periode?: number | null;
  type_honos_bilans?: "Inclus" | "Facturés" | null;
  type_honos_jur?: "Facturés" | "Inclus" | "Non souscrit" | null;
  type_honos_creation?: "Facturés" | "Non souscrit" | null;
  type_honos_reprise?: "Facturés" | "Non souscrit" | null;
  tdb_periode?: "Mensuel" | "Trimestriel" | "Non souscrit" | null;
  /**
   * Dirigeant à rattacher comme contact. `prenom` et `nom` sont stockés
   * séparément en DB depuis la migration 0027. `civilite` requise pour la LDM.
   * `email` et `telephone` optionnels (peuvent être ajoutés plus tard).
   */
  interlocuteur?: {
    civilite: "M." | "Mme" | "Mlle" | null;
    prenom: string | null;
    nom: string;
    qualite: string | null;
    email?: string | null;
    telephone?: string | null;
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
      fin_mission_date: payload.fin_mission_date ?? null,
      adresse_siege: payload.adresse_siege ?? null,
      code_postal: payload.code_postal ?? null,
      ville: payload.ville ?? null,
      // Honoraires (null = ne pas écrire, garde la valeur par défaut 0)
      ...(payload.honoraires_compta != null && { honoraires_compta: payload.honoraires_compta }),
      ...(payload.forfait_bilan != null && { forfait_bilan: payload.forfait_bilan }),
      ...(payload.honoraires_jur != null && { honoraires_jur: payload.honoraires_jur }),
      ...(payload.honoraires_creation != null && { honoraires_creation: payload.honoraires_creation }),
      ...(payload.honoraires_reprise != null && { honoraires_reprise: payload.honoraires_reprise }),
      ...(payload.tdb_honos_periode != null && { tdb_honos_periode: payload.tdb_honos_periode }),
      ...(payload.type_honos_bilans && { type_honos_bilans: payload.type_honos_bilans }),
      ...(payload.type_honos_jur && { type_honos_jur: payload.type_honos_jur }),
      ...(payload.type_honos_creation && { type_honos_creation: payload.type_honos_creation }),
      ...(payload.type_honos_reprise && { type_honos_reprise: payload.type_honos_reprise }),
      ...(payload.tdb_periode && { tdb_periode: payload.tdb_periode }),
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(error.message);
  const clientId = created.id;

  // Lien contact si fourni
  if (payload.interlocuteur?.nom?.trim()) {
    const nomFamille = payload.interlocuteur.nom.trim();
    const prenom = payload.interlocuteur.prenom?.trim() || null;
    const civilite = payload.interlocuteur.civilite ?? null;
    const role = payload.interlocuteur.qualite ?? null;
    const emailDirigeant = payload.interlocuteur.email?.trim() || null;
    const telephoneDirigeant = payload.interlocuteur.telephone?.trim() || null;

    // Réutilise le contact s'il existe déjà (match exact prénom + nom)
    const { data: existing } = await sb
      .from("contacts")
      .select("id, civilite, email, telephone")
      .eq("nom", nomFamille)
      .eq("prenom", prenom ?? "")
      .maybeSingle();

    let contactId: string;
    if (existing) {
      contactId = existing.id;
      // Complète les champs manquants avec ce qu'on a saisi cette fois.
      // On ne SURÉCRIT JAMAIS un champ existant (au cas où l'autre dossier a
      // une info plus récente / valide).
      const patch: Record<string, string | null> = {};
      if (!existing.civilite && civilite) patch.civilite = civilite;
      if (!existing.email && emailDirigeant) patch.email = emailDirigeant;
      if (!existing.telephone && telephoneDirigeant) patch.telephone = telephoneDirigeant;
      if (Object.keys(patch).length > 0) {
        await sb.from("contacts").update(patch).eq("id", contactId);
      }
    } else {
      const { data: inserted, error: e2 } = await sb
        .from("contacts")
        .insert({
          nom: nomFamille,
          prenom,
          civilite,
          email: emailDirigeant,
          telephone: telephoneDirigeant,
        })
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
  return { id: clientId, slug: created.slug };
}
