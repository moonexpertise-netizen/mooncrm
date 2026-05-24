"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Met à jour le statut d'une obligation à partir d'un libellé.
 * Cherche la correspondance dans status_options pour récupérer statut_logique.
 * Si libelle = null, remet à zéro (A_FAIRE, statut_detail = null).
 */
export async function updateObligationStatus(
  obligationId: string,
  libelle: string | null
) {
  const sb = await createClient();

  if (!libelle) {
    // Réinitialiser : on remet le libellé par défaut A_FAIRE du type (pour
    // afficher "Pas commencé" sur TVA, "A traiter" sur IS, etc. · pas un
    // générique "Non commencé").
    const { data: obl } = await sb
      .from("obligations")
      .select("type, client_id")
      .eq("id", obligationId)
      .single();
    let defaultLibelle: string | null = null;
    if (obl) {
      const { data: defaultOpt } = await sb
        .from("status_options")
        .select("libelle")
        .eq("scope", "obligation")
        .eq("type_code", obl.type)
        .eq("statut_logique", "A_FAIRE")
        .eq("actif", true)
        .order("ordre")
        .limit(1)
        .maybeSingle();
      defaultLibelle = defaultOpt?.libelle ?? null;
    }
    const { error } = await sb
      .from("obligations")
      .update({ statut_logique: "A_FAIRE", statut_detail: defaultLibelle })
      .eq("id", obligationId);
    if (error) throw new Error(error.message);
    revalidatePath("/obligations/suivi");
    if (obl) revalidatePath(`/clients/${obl.client_id}`);
    return;
  }

  // Récupère le type de l'obligation
  const { data: obl, error: e0 } = await sb
    .from("obligations")
    .select("type, client_id")
    .eq("id", obligationId)
    .single();
  if (e0) throw new Error(e0.message);

  // Lookup statut_logique depuis status_options
  const { data: opt } = await sb
    .from("status_options")
    .select("statut_logique")
    .eq("scope", "obligation")
    .eq("type_code", obl.type)
    .eq("libelle", libelle)
    .maybeSingle();

  const statut_logique = opt?.statut_logique ?? "A_FAIRE";

  const { error } = await sb
    .from("obligations")
    .update({ statut_logique, statut_detail: libelle })
    .eq("id", obligationId);
  if (error) throw new Error(error.message);

  revalidatePath("/obligations/suivi");
  revalidatePath(`/clients/${obl.client_id}`);
}

/**
 * Met à jour le statut de plusieurs obligations d'un coup.
 * libelle = null : remet chacune à son libellé A_FAIRE par défaut (par type).
 * libelle = "...": cherche statut_logique correspondant pour chaque type.
 */
export async function bulkUpdateObligationStatus(
  obligationIds: string[],
  libelle: string | null
) {
  if (!obligationIds.length) return { updated: 0 };
  const sb = await createClient();

  const { data: obls, error: e0 } = await sb
    .from("obligations")
    .select("id, type, client_id")
    .in("id", obligationIds);
  if (e0) throw new Error(e0.message);
  if (!obls?.length) return { updated: 0 };

  // Regroupe par type
  const idsByType = new Map<string, string[]>();
  for (const o of obls) {
    if (!idsByType.has(o.type)) idsByType.set(o.type, []);
    idsByType.get(o.type)!.push(o.id);
  }

  let updated = 0;

  if (!libelle) {
    // Reset: trouve le défaut A_FAIRE par type
    const types = [...idsByType.keys()];
    const { data: defaults } = await sb
      .from("status_options")
      .select("type_code, libelle, ordre")
      .eq("scope", "obligation")
      .in("type_code", types)
      .eq("statut_logique", "A_FAIRE")
      .eq("actif", true)
      .order("ordre");

    const defaultByType = new Map<string, string>();
    for (const d of defaults ?? []) {
      if (!defaultByType.has(d.type_code)) defaultByType.set(d.type_code, d.libelle);
    }

    for (const [type, ids] of idsByType) {
      const def = defaultByType.get(type) ?? null;
      const { error } = await sb
        .from("obligations")
        .update({ statut_logique: "A_FAIRE", statut_detail: def })
        .in("id", ids);
      if (error) throw new Error(error.message);
      updated += ids.length;
    }
  } else {
    // Pour chaque type, vérifie que le libellé existe et applique
    for (const [type, ids] of idsByType) {
      const { data: opt } = await sb
        .from("status_options")
        .select("statut_logique")
        .eq("scope", "obligation")
        .eq("type_code", type)
        .eq("libelle", libelle)
        .maybeSingle();
      if (!opt) continue;

      const { error } = await sb
        .from("obligations")
        .update({ statut_logique: opt.statut_logique, statut_detail: libelle })
        .in("id", ids);
      if (error) throw new Error(error.message);
      updated += ids.length;
    }
  }

  revalidatePath("/obligations/suivi");
  const clientIds = [...new Set(obls.map((o) => o.client_id))];
  for (const cid of clientIds) revalidatePath(`/clients/${cid}`);
  return { updated };
}

/**
 * Met à jour la note libre sur une obligation. note = null ou "" -> efface.
 */
export async function updateObligationNote(obligationId: string, note: string | null) {
  const sb = await createClient();
  const cleaned = note && note.trim() !== "" ? note.trim() : null;

  const { data: obl } = await sb
    .from("obligations")
    .select("client_id")
    .eq("id", obligationId)
    .single();

  const { error } = await sb
    .from("obligations")
    .update({ note: cleaned })
    .eq("id", obligationId);
  if (error) throw new Error(error.message);

  revalidatePath("/obligations/suivi");
  if (obl) revalidatePath(`/clients/${obl.client_id}`);
}
