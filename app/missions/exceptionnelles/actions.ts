"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server actions pour le module Missions Exceptionnelles.
 * Modele : missions_exceptionnelles + mission_exc_types. Cf. migration 0048.
 *
 * Pattern :
 *   - createMission / updateMission / deleteMission
 *   - setEtatMission / setEtatFacturation (raccourcis pour les pickers UI)
 *   - createType / renameType / deleteType / setTypeActif (gestion de la liste
 *     editable depuis l'UI)
 */

export type EtatMission =
  | "a_demarrer"
  | "en_cours"
  | "livree"
  | "annulee";

export type EtatFacturation =
  | "a_facturer"
  | "facturee"
  | "payee"
  | "sans_facture";

// Statut de la lettre de mission pour les missions ponctuelles.
// - a_faire : LDM a preparer
// - na      : pas de LDM necessaire pour cette mission
// - envoyee : LDM envoyee en signature au client
// - signee  : LDM signee par le client
export type LdmStatutMission = "a_faire" | "na" | "envoyee" | "signee";

// ============================================================================
//  Missions
// ============================================================================

export type MissionExcInput = {
  client_id?: string | null;
  client_libre?: string | null;
  mission: string;
  type_id?: string | null;
  description?: string | null;
  duree_theorique_h?: number | null;
  duree_reelle_h?: number | null;
  taux_horaire?: number | null;
  forfait?: number | null;
  etat_mission?: EtatMission;
  etat_facturation?: EtatFacturation;
  ldm_statut?: LdmStatutMission;
  date_debut?: string | null;
  date_fin?: string | null;
};

export async function createMission(input: MissionExcInput) {
  if (!input.mission?.trim()) throw new Error("Mission obligatoire");
  const sb = await createClient();
  const { data, error } = await sb
    .from("missions_exceptionnelles")
    .insert({
      client_id: input.client_id || null,
      client_libre: input.client_libre?.trim() || null,
      mission: input.mission.trim(),
      type_id: input.type_id || null,
      description: input.description?.trim() || null,
      duree_theorique_h: input.duree_theorique_h ?? null,
      duree_reelle_h: input.duree_reelle_h ?? null,
      taux_horaire: input.taux_horaire ?? null,
      forfait: input.forfait ?? null,
      etat_mission: input.etat_mission ?? "a_demarrer",
      etat_facturation: input.etat_facturation ?? "a_facturer",
      ldm_statut: input.ldm_statut ?? "a_faire",
      date_debut: input.date_debut || null,
      date_fin: input.date_fin || null,
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMission(
  missionId: string,
  patch: Record<string, string | number | boolean | null>
) {
  const sb = await createClient();
  // Sanitise : trim sur les champs texte non null
  const cleaned: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string") {
      const t = v.trim();
      cleaned[k] = t === "" ? null : t;
    } else {
      cleaned[k] = v;
    }
  }
  const { error } = await sb
    .from("missions_exceptionnelles")
    .update(cleaned)
    .eq("id", missionId);
  if (error) throw new Error(error.message);
}

export async function deleteMission(missionId: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("missions_exceptionnelles")
    .delete()
    .eq("id", missionId);
  if (error) throw new Error(error.message);
}

export async function setEtatMission(missionId: string, etat: EtatMission) {
  const sb = await createClient();
  const { error } = await sb
    .from("missions_exceptionnelles")
    .update({ etat_mission: etat })
    .eq("id", missionId);
  if (error) throw new Error(error.message);
}

export async function setEtatFacturation(
  missionId: string,
  etat: EtatFacturation
) {
  const sb = await createClient();
  const { error } = await sb
    .from("missions_exceptionnelles")
    .update({ etat_facturation: etat })
    .eq("id", missionId);
  if (error) throw new Error(error.message);
}

export async function setLdmStatutMission(
  missionId: string,
  statut: LdmStatutMission
) {
  const sb = await createClient();
  const { error } = await sb
    .from("missions_exceptionnelles")
    .update({ ldm_statut: statut })
    .eq("id", missionId);
  if (error) throw new Error(error.message);
}

// ============================================================================
//  Types editables
// ============================================================================

export async function createMissionType(label: string) {
  if (!label?.trim()) throw new Error("Libelle obligatoire");
  const sb = await createClient();
  // Place le nouveau type en fin d'ordre (max + 10)
  const { data: maxRow } = await sb
    .from("mission_exc_types")
    .select("ordre")
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordre = (maxRow?.ordre ?? 0) + 10;
  const { data, error } = await sb
    .from("mission_exc_types")
    .insert({ label: label.trim(), ordre, actif: true })
    .select("id, slug, label, ordre, actif")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function renameMissionType(typeId: string, label: string) {
  if (!label?.trim()) throw new Error("Libelle obligatoire");
  const sb = await createClient();
  const { error } = await sb
    .from("mission_exc_types")
    .update({ label: label.trim() })
    .eq("id", typeId);
  if (error) throw new Error(error.message);
}

export async function setMissionTypeActif(typeId: string, actif: boolean) {
  const sb = await createClient();
  const { error } = await sb
    .from("mission_exc_types")
    .update({ actif })
    .eq("id", typeId);
  if (error) throw new Error(error.message);
}

export async function deleteMissionType(typeId: string) {
  const sb = await createClient();
  // Verifie qu'aucune mission n'utilise ce type
  const { count } = await sb
    .from("missions_exceptionnelles")
    .select("id", { count: "exact", head: true })
    .eq("type_id", typeId);
  if ((count ?? 0) > 0) {
    throw new Error(
      `Ce type est utilise par ${count} mission(s). Reaffectez-les avant suppression, ou desactivez le type.`
    );
  }
  const { error } = await sb.from("mission_exc_types").delete().eq("id", typeId);
  if (error) throw new Error(error.message);
}
