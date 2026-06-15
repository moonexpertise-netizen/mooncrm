"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";

/**
 * Server actions du module Pilotage / Dashboard.
 *
 * Modele :
 *   - 2 colonnes sur clients : tdb_livraison_periode (Mensuelle/Trimestrielle)
 *                              rdv_expert_periode (Mensuel/Trimestriel)
 *   - 1 table pilotage_obligations : 1 ligne par (client, annee, type, periode)
 *     type ∈ {'TDB', 'RDV'}, periode = 'YYYY-MM'
 *
 * Statuts hardcodes (pas dans status_options) :
 *   TDB : A preparer / Prepare / Presente / N/A
 *   RDV : RDV a planifier / RDV planifie / RDV realise / N/A
 *
 * Cf. migration 0062.
 */

export type PilotageType = "TDB" | "RDV";
export type PilotageStatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";
export type TdbCadence = "Mensuelle" | "Trimestrielle";
export type RdvCadence = "Mensuel" | "Trimestriel";

const MENSUEL_MOIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// Trimestriel : on affiche les cellules sur le DERNIER mois du trimestre
// (= mois qui ferme la periode couverte) :
//   T1 (Jan-Fev-Mars)    -> cellule Mars,      echeance livraison avril
//   T2 (Avr-Mai-Juin)    -> cellule Juin,      echeance livraison juillet
//   T3 (Juil-Aout-Sept)  -> cellule Septembre, echeance livraison octobre
//   T4 (Oct-Nov-Dec)     -> cellule Decembre,  echeance livraison janvier N+1
// Le statut sur la cellule "Mars" suit la livraison du TdB Q1.
const TRIMESTRIEL_MOIS = [3, 6, 9, 12];

/** Genere la liste des periodes 'YYYY-MM' selon cadence. */
function periodesForYear(annee: number, isTrimestriel: boolean): string[] {
  const mois = isTrimestriel ? TRIMESTRIEL_MOIS : MENSUEL_MOIS;
  return mois.map((m) => `${annee}-${String(m).padStart(2, "0")}`);
}

/** Recupere la cadence applicable a un type pour un client. NULL = mensuel par defaut. */
function isTrimestrielFromValue(v: string | null | undefined): boolean {
  return !!v && v.toLowerCase().startsWith("trim");
}

/**
 * Active ou desactive le suivi Pilotage pour (client, annee, type).
 *   - enabled=true  : cree les rows manquantes pour les periodes de la cadence
 *   - enabled=false : supprime TOUTES les rows pour (client, annee, type), y
 *                     compris celles deja remplies (le user perd le travail).
 *                     A appeler avec confirmation cote UI si besoin.
 *
 * Defensive : retourne { ok, error } au lieu de throw.
 */
export async function togglePilotageSubscription(
  clientId: string,
  annee: number,
  type: PilotageType,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission("edit_production");
    const sb = await createClient();

    if (!enabled) {
      const { error } = await sb
        .from("pilotage_obligations")
        .delete()
        .eq("client_id", clientId)
        .eq("annee", annee)
        .eq("type", type);
      if (error) throw new Error(error.message);
      revalidatePath("/missions/pilotage");
      revalidatePath(`/clients/${clientId}`);
      return { ok: true };
    }

    // Lire la cadence pour CETTE annee (client_year_config). Fallback sur
    // clients.tdb_livraison_periode si pas de config pour cette annee
    // (back-compat avec l'ancien stockage globaux).
    const { data: yc } = await sb
      .from("client_year_config")
      .select("tdb_livraison_periode, rdv_expert_periode")
      .eq("client_id", clientId)
      .eq("annee", annee)
      .maybeSingle();
    let cadence: string | null = type === "TDB"
      ? (yc as { tdb_livraison_periode?: string | null } | null)?.tdb_livraison_periode ?? null
      : (yc as { rdv_expert_periode?: string | null } | null)?.rdv_expert_periode ?? null;
    if (!cadence) {
      const { data: c } = await sb
        .from("clients")
        .select("tdb_livraison_periode, rdv_expert_periode")
        .eq("id", clientId)
        .single();
      cadence = type === "TDB"
        ? (c as { tdb_livraison_periode?: string | null } | null)?.tdb_livraison_periode ?? null
        : (c as { rdv_expert_periode?: string | null } | null)?.rdv_expert_periode ?? null;
    }
    const isTri = isTrimestrielFromValue(cadence);

    // Lire les rows existantes pour ne pas re-creer (idempotent)
    const { data: existing } = await sb
      .from("pilotage_obligations")
      .select("periode")
      .eq("client_id", clientId)
      .eq("annee", annee)
      .eq("type", type);
    const existingPeriodes = new Set((existing ?? []).map((r) => r.periode));

    const targetPeriodes = periodesForYear(annee, isTri);
    const toInsert = targetPeriodes
      .filter((p) => !existingPeriodes.has(p))
      .map((p) => ({
        client_id: clientId,
        annee,
        type,
        periode: p,
        statut_logique: "A_FAIRE",
        statut_detail: type === "TDB" ? "À préparer" : "RDV à planifier",
      }));

    if (toInsert.length > 0) {
      const { error } = await sb.from("pilotage_obligations").insert(toInsert);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/missions/pilotage");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[togglePilotageSubscription]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Set le statut (libelle + logique) d'une cellule pilotage_obligations.
 * Si libelle="N/A" => statut_logique=NON_APPLICABLE. Si null, on remet
 * a A_FAIRE avec le libelle par defaut.
 */
export async function setPilotageStatut(
  clientId: string,
  annee: number,
  type: PilotageType,
  periode: string,
  libelle: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission("edit_production");
    const sb = await createClient();

    let statut_logique: PilotageStatutLogique = "A_FAIRE";
    let statut_detail: string | null = libelle;

    if (libelle === null) {
      statut_detail = type === "TDB" ? "À préparer" : "RDV à planifier";
    } else if (libelle === "Présenté" || libelle === "RDV réalisé") {
      statut_logique = "TERMINE";
    } else if (libelle === "Préparé" || libelle === "RDV planifié") {
      statut_logique = "EN_COURS";
    } else if (libelle === "N/A") {
      statut_logique = "NON_APPLICABLE";
    } else {
      statut_logique = "A_FAIRE";
    }

    const { error } = await sb
      .from("pilotage_obligations")
      .update({ statut_logique, statut_detail })
      .eq("client_id", clientId)
      .eq("annee", annee)
      .eq("type", type)
      .eq("periode", periode);
    if (error) throw new Error(error.message);

    revalidatePath("/missions/pilotage");
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[setPilotageStatut]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Change la cadence (TDB livraison ou RDV) pour UNE annee d'un client.
 * Stocke dans client_year_config (la cadence peut differer d'une annee a
 * l'autre, comme le regime fiscal IR/IS).
 *
 * Met aussi a jour les rows pilotage_obligations de cette annee :
 *   - Supprime les rows hors cadence ET encore vierges (A_FAIRE)
 *   - Cree les rows manquantes pour la nouvelle cadence
 *   - Preserve les rows deja travaillees (EN_COURS / TERMINE)
 */
export async function setPilotageCadence(
  clientId: string,
  annee: number,
  aspect: "tdb" | "rdv",
  value: TdbCadence | RdvCadence | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission("edit_production");
    const sb = await createClient();
    const col = aspect === "tdb" ? "tdb_livraison_periode" : "rdv_expert_periode";
    const type: PilotageType = aspect === "tdb" ? "TDB" : "RDV";

    // Upsert dans client_year_config pour cette (client, annee)
    const { error: errUpd } = await sb
      .from("client_year_config")
      .upsert(
        { client_id: clientId, annee, [col]: value },
        { onConflict: "client_id,annee" }
      );
    if (errUpd) throw new Error(errUpd.message);

    const isTri = isTrimestrielFromValue(value);
    const targetPeriodes = new Set(periodesForYear(annee, isTri));

    // 1. Supprimer les rows hors cadence ET encore A_FAIRE (preserve le travail)
    const { data: existing } = await sb
      .from("pilotage_obligations")
      .select("id, periode, statut_logique")
      .eq("client_id", clientId)
      .eq("annee", annee)
      .eq("type", type);
    const obsoleteIds = (existing ?? [])
      .filter((r) => !targetPeriodes.has(r.periode) && r.statut_logique === "A_FAIRE")
      .map((r) => r.id);
    if (obsoleteIds.length > 0) {
      await sb.from("pilotage_obligations").delete().in("id", obsoleteIds);
    }

    // 2. Creer les rows manquantes pour la nouvelle cadence
    const existingPeriodes = new Set((existing ?? []).map((r) => r.periode));
    const toInsert = [...targetPeriodes]
      .filter((p) => !existingPeriodes.has(p))
      .map((p) => ({
        client_id: clientId,
        annee,
        type,
        periode: p,
        statut_logique: "A_FAIRE",
        statut_detail: type === "TDB" ? "À préparer" : "RDV à planifier",
      }));
    if (toInsert.length > 0) {
      await sb.from("pilotage_obligations").insert(toInsert);
    }

    revalidatePath("/missions/pilotage");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[setPilotageCadence]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Bulk set statut sur plusieurs cellules. ids = liste des pilotage_obligations.id.
 * Utilise par la BulkActionBar Excel-style.
 */
export async function bulkSetPilotageStatut(
  ids: string[],
  libelle: string | null,
  type: PilotageType
): Promise<{ ok: boolean; updated: number; error?: string }> {
  if (ids.length === 0) return { ok: true, updated: 0 };
  try {
    await requirePermission("edit_production");
    const sb = await createClient();
    let statut_logique: PilotageStatutLogique = "A_FAIRE";
    let statut_detail: string | null = libelle;

    if (libelle === null) {
      statut_detail = type === "TDB" ? "À préparer" : "RDV à planifier";
    } else if (libelle === "Présenté" || libelle === "RDV réalisé") {
      statut_logique = "TERMINE";
    } else if (libelle === "Préparé" || libelle === "RDV planifié") {
      statut_logique = "EN_COURS";
    } else if (libelle === "N/A") {
      statut_logique = "NON_APPLICABLE";
    } else {
      statut_logique = "A_FAIRE";
    }

    const { error } = await sb
      .from("pilotage_obligations")
      .update({ statut_logique, statut_detail })
      .in("id", ids);
    if (error) throw new Error(error.message);

    revalidatePath("/missions/pilotage");
    return { ok: true, updated: ids.length };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[bulkSetPilotageStatut]", e);
    return { ok: false, updated: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
