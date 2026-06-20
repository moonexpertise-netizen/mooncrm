"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateFinanceViews } from "@/lib/revalidate-finance";
import { requirePermission } from "@/lib/auth";

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
  await requirePermission("edit_production");
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
    // null par defaut : la facturation se decide quand la mission passe en
    // "livree" (auto-set a "a_facturer" via trigger / appli a ce moment-la).
    // Une mission a peine creee n'est pas encore a facturer.
    etat_facturation: input.etat_facturation ?? null,
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
  revalidateFinanceViews();
  return res.data;
}

export async function updateMission(
  missionId: string,
  patch: Record<string, string | number | boolean | null>
) {
  await requirePermission("edit_production");
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
  revalidateFinanceViews();
}

export async function deleteMission(missionId: string) {
  await requirePermission("edit_production");
  const sb = await createClient();
  const { error } = await sb
    .from("missions_exceptionnelles")
    .delete()
    .eq("id", missionId);
  if (error) throw new Error(error.message);
  revalidateFinanceViews();
}

/**
 * Duplique une mission existante. Copie TOUS les champs tels quels (etats,
 * dates, durees, LDM, etc.), seule la mission est suffixee " (copie)".
 * Pas de reset : la copie reprend exactement le meme etat que l'original.
 * Le slug est regenere automatiquement par le trigger DB.
 */
export async function duplicateMission(missionId: string) {
  await requirePermission("edit_production");
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

  // Copie des champs metier. Le slug est auto-genere par le trigger DB
  // avec un suffixe '-2' si conflit.
  //
  // On RESET 3 champs :
  //   - etat_mission     -> "a_demarrer" (la copie est une nouvelle mission)
  //   - etat_facturation -> null (sera auto-set a "a_facturer" au passage en
  //                        "livree" via trigger). Sinon la copie d'une
  //                        mission "facturee" reste cachee du tab a facturer.
  //   - ldm_statut       -> "a_faire" (idem, repartir a zero)
  // Le user peut ensuite ajuster sur la copie.
  const newRow: Record<string, unknown> = {
    ...source,
    etat_mission: "a_demarrer",
    etat_facturation: null,
    ldm_statut: "a_faire",
  };

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
  revalidateFinanceViews();
  return res.data;
}

export async function setEtatMission(missionId: string, etat: EtatMission) {
  await requirePermission("edit_production");
  const sb = await createClient();
  const { error } = await sb
    .from("missions_exceptionnelles")
    .update({ etat_mission: etat })
    .eq("id", missionId);
  if (error) throw new Error(error.message);
  revalidateFinanceViews();
}

export async function setEtatFacturation(
  missionId: string,
  etat: EtatFacturation | null
) {
  await requirePermission("edit_facturation");
  const sb = await createClient();
  const { error } = await sb
    .from("missions_exceptionnelles")
    .update({ etat_facturation: etat })
    .eq("id", missionId);
  if (error) throw new Error(error.message);
  revalidateFinanceViews();
}

export async function setLdmStatutMission(
  missionId: string,
  statut: LdmStatutMission
) {
  await requirePermission("edit_production");
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

export async function createMissionType(label: string, tarif: number = 0) {
  await requirePermission("edit_honoraires");
  if (!label?.trim()) throw new Error("Libelle obligatoire");
  if (tarif < 0) throw new Error("Tarif doit etre positif");
  const sb = await createClient();
  // Place le nouveau type en fin d'ordre (max + 10)
  const { data: maxRow } = await sb
    .from("mission_exc_types")
    .select("ordre")
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordre = (maxRow?.ordre ?? 0) + 10;
  // Try with tarif (migration 0067). Si la colonne n'existe pas, fallback
  // sans tarif pour ne pas bloquer en attendant la migration.
  let res = await sb
    .from("mission_exc_types")
    .insert({ label: label.trim(), ordre, actif: true, tarif })
    .select("id, slug, label, ordre, actif, tarif")
    .single();
  if (res.error && /tarif/i.test(res.error.message)) {
    res = await sb
      .from("mission_exc_types")
      .insert({ label: label.trim(), ordre, actif: true })
      .select("id, slug, label, ordre, actif")
      .single();
  }
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * Duplique un type de mission. Copie label (suffixe « (copie) »), tarif et
 * statut actif. Placé en fin d'ordre (max + 10) ; l'UI peut ensuite le
 * réordonner. Le slug est régénéré par le trigger DB.
 */
export async function duplicateMissionType(typeId: string) {
  await requirePermission("edit_production");
  const sb = await createClient();

  // Source : try avec tarif (migration 0067), fallback sans.
  let src: { label: string; actif: boolean; tarif?: number | null } | null = null;
  const r1 = await sb
    .from("mission_exc_types")
    .select("label, actif, tarif")
    .eq("id", typeId)
    .single();
  if (r1.error && /tarif/i.test(r1.error.message)) {
    const r2 = await sb
      .from("mission_exc_types")
      .select("label, actif")
      .eq("id", typeId)
      .single();
    if (r2.error) throw new Error(r2.error.message);
    src = { ...(r2.data as { label: string; actif: boolean }), tarif: 0 };
  } else if (r1.error) {
    throw new Error(r1.error.message);
  } else {
    src = r1.data as { label: string; actif: boolean; tarif: number };
  }
  if (!src) throw new Error("Type introuvable");

  const { data: maxRow } = await sb
    .from("mission_exc_types")
    .select("ordre")
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordre = (maxRow?.ordre ?? 0) + 10;
  const label = `${src.label} (copie)`;

  let res = await sb
    .from("mission_exc_types")
    .insert({ label, ordre, actif: src.actif, tarif: src.tarif ?? 0 })
    .select("id, slug, label, ordre, actif, tarif")
    .single();
  if (res.error && /tarif/i.test(res.error.message)) {
    res = await sb
      .from("mission_exc_types")
      .insert({ label, ordre, actif: src.actif })
      .select("id, slug, label, ordre, actif")
      .single();
  }
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * Réordonne les types de mission. `orderedIds` = liste des ids dans l'ordre
 * voulu ; on écrit ordre = index * 10 (espacement pour insertions futures).
 */
export async function reorderMissionTypes(orderedIds: string[]) {
  await requirePermission("edit_production");
  if (!orderedIds?.length) return;
  const sb = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      sb.from("mission_exc_types").update({ ordre: i * 10 }).eq("id", id)
    )
  );
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) throw new Error(firstErr.error.message);
}

export async function renameMissionType(typeId: string, label: string) {
  await requirePermission("edit_production");
  if (!label?.trim()) throw new Error("Libelle obligatoire");
  const sb = await createClient();
  const { error } = await sb
    .from("mission_exc_types")
    .update({ label: label.trim() })
    .eq("id", typeId);
  if (error) throw new Error(error.message);
}

/** Met a jour le tarif (forfait par defaut) d'un type de mission. */
export async function setMissionTypeTarif(typeId: string, tarif: number) {
  await requirePermission("edit_honoraires");
  if (tarif < 0) throw new Error("Tarif doit etre positif");
  const sb = await createClient();
  const { error } = await sb
    .from("mission_exc_types")
    .update({ tarif })
    .eq("id", typeId);
  if (error) throw new Error(error.message);
}

export async function setMissionTypeActif(typeId: string, actif: boolean) {
  await requirePermission("edit_production");
  const sb = await createClient();
  const { error } = await sb
    .from("mission_exc_types")
    .update({ actif })
    .eq("id", typeId);
  if (error) throw new Error(error.message);
}

export async function deleteMissionType(typeId: string) {
  await requirePermission("edit_production");
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
