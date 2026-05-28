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
  | "a_facturer" | "facturee" | "sans_facture";

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
  // baseRow : champs presents depuis migration 0048
  const baseRow = {
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
    date_debut: input.date_debut || null,
    date_fin: input.date_fin || null,
  };
  // Try with ldm_statut (migration 0049). Si ldm_statut column missing,
  // fallback sans le champ pour pas bloquer la creation.
  let res = await sb
    .from("missions_exceptionnelles")
    .insert({ ...baseRow, ldm_statut: input.ldm_statut ?? "a_faire" })
    .select("id, slug")
    .single();
  if (res.error && /ldm_statut/i.test(res.error.message)) {
    res = await sb
      .from("missions_exceptionnelles")
      .insert(baseRow)
      .select("id, slug")
      .single();
  }
  if (res.error) throw new Error(res.error.message);
  return res.data;
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

/**
 * Duplique une mission existante. Copie TOUS les champs tels quels (etats,
 * dates, durees, LDM, etc.), seule la mission est suffixee " (copie)".
 * Pas de reset : la copie reprend exactement le meme etat que l'original.
 * Le slug est regenere automatiquement par le trigger DB.
 */
export async function duplicateMission(missionId: string) {
  const sb = await createClient();
  // Recupere la source avec tous les champs metier (try avec ldm_statut,
  // fallback sans si migration 0049 pas appliquee)
  const fullCols =
    "client_id, client_libre, mission, type_id, description, duree_theorique_h, duree_reelle_h, taux_horaire, forfait, etat_mission, etat_facturation, ldm_statut, date_debut, date_fin";
  const fallbackCols =
    "client_id, client_libre, mission, type_id, description, duree_theorique_h, duree_reelle_h, taux_horaire, forfait, etat_mission, etat_facturation, date_debut, date_fin";

  let source: Record<string, unknown> | null = null;
  const r1 = await sb
    .from("missions_exceptionnelles")
    .select(fullCols)
    .eq("id", missionId)
    .single();
  if (r1.error && /ldm_statut/i.test(r1.error.message)) {
    const r2 = await sb
      .from("missions_exceptionnelles")
      .select(fallbackCols)
      .eq("id", missionId)
      .single();
    if (r2.error) throw new Error(r2.error.message);
    source = r2.data as Record<string, unknown>;
  } else if (r1.error) {
    throw new Error(r1.error.message);
  } else {
    source = r1.data as Record<string, unknown>;
  }
  if (!source) throw new Error("Mission introuvable");

  // Copie tous les champs metier, suffixe la mission " (copie)"
  const newRow: Record<string, unknown> = { ...source };
  newRow.mission = `${String(source.mission ?? "")} (copie)`;

  // Insert avec fallback si ldm_statut absent
  let res = await sb
    .from("missions_exceptionnelles")
    .insert(newRow)
    .select("id, slug")
    .single();
  if (res.error && /ldm_statut/i.test(res.error.message)) {
    const { ldm_statut: _drop, ...withoutLdm } = newRow;
    void _drop;
    res = await sb
      .from("missions_exceptionnelles")
      .insert(withoutLdm)
      .select("id, slug")
      .single();
  }
  if (res.error) throw new Error(res.error.message);
  return res.data;
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
