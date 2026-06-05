"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateFinanceViews } from "@/lib/revalidate-finance";

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
    // Perf : optimistic update cote tracker. Pas de revalidatePath sur la
    // page client (lourd), mais on invalide /facturation et /finance qui
    // agregent les statuts AGO/Bilan facturables.
    revalidateFinanceViews();
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
  // /facturation et /finance agregent statuts AGO/Bilan facturables : invalidate.
  revalidateFinanceViews();
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

  // Perf : optimistic update cote tracker. Pas de revalidatePath sur les
  // pages clients (le bulk en touche N, le pire offender). On invalide
  // seulement /facturation + /finance qui agregent.
  revalidateFinanceViews();
  return { updated };
}

/**
 * Permet de changer le statut d'une echeance depuis la page /obligations,
 * y compris quand l'obligation n'a pas encore de ligne en DB (les
 * "obligations virtuelles" sont des cellules attendues d'apres les
 * subscriptions mais sans saisie reelle).
 *
 * - Si payload.obligationId : delegue a updateObligationStatus (update simple)
 * - Sinon : INSERT la ligne obligations avec le statut + retour de l'id
 *
 * Retourne l'id de la ligne obligations (existant ou nouvellement cree)
 * pour que l'UI puisse mettre a jour son state local et eviter une 2e
 * insertion au prochain pick.
 */
export async function setEcheanceStatus(
  payload: {
    obligationId: string | null;
    clientId: string;
    type: string;
    periode: string;
    annee: number;
  },
  libelle: string | null
): Promise<{ obligationId: string }> {
  // Existant : delegue a la fonction simple, qui gere reset + revalidate.
  if (payload.obligationId) {
    await updateObligationStatus(payload.obligationId, libelle);
    return { obligationId: payload.obligationId };
  }

  // Virtuel + reset (libelle null) : delegue a ensureObligationRow qui
  // remplit le statut_detail avec le libelle A_FAIRE par defaut du type
  // (ex. "Pas commence" / "0 - A traiter"). Sans ca, l'INSERT mettrait
  // statut_detail=null et le chip resterait "blanc" cote tracker.
  if (libelle === null) {
    const ensured = await ensureObligationRow(payload);
    revalidateFinanceViews();
    return ensured;
  }

  // Virtuel + libelle defini : insertion avec le statut choisi.
  const sb = await createClient();
  const { data: opt } = await sb
    .from("status_options")
    .select("statut_logique")
    .eq("scope", "obligation")
    .eq("type_code", payload.type)
    .eq("libelle", libelle)
    .maybeSingle();
  const statut_logique = opt?.statut_logique ?? "A_FAIRE";

  const { data: inserted, error } = await sb
    .from("obligations")
    .insert({
      client_id: payload.clientId,
      type: payload.type,
      periode: payload.periode,
      annee: payload.annee,
      statut_logique,
      statut_detail: libelle,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidateFinanceViews();
  return { obligationId: inserted.id };
}

/**
 * Materialise une obligation "virtuelle" (cellule attendue d'apres les
 * subscriptions, mais sans ligne en DB). Necessaire pour pouvoir lui
 * attacher un commentaire : obligation_comments.obligation_id reference
 * une ligne reelle.
 *
 * Idempotent : si une ligne existe deja pour (client, type, periode),
 * retourne son id sans creer de doublon. Sinon insere une ligne A_FAIRE
 * avec le libelle par defaut du type (= ce que l'engine afficherait
 * comme placeholder, ex. "Pas commence" / "A faire").
 *
 * On NE revalide PAS les vues finance ici : la cellule reste fonctionnellement
 * a "A faire", donc rien ne change pour les agregats facturation/finance.
 */
export async function ensureObligationRow(payload: {
  clientId: string;
  type: string;
  periode: string;
  annee: number;
}): Promise<{ obligationId: string }> {
  const sb = await createClient();

  // 1. Existe deja ?
  const { data: existing } = await sb
    .from("obligations")
    .select("id")
    .eq("client_id", payload.clientId)
    .eq("type", payload.type)
    .eq("periode", payload.periode)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return { obligationId: existing.id };

  // 2. Libelle A_FAIRE par defaut (pour rester coherent avec le tracker
  // qui affiche "Pas commence" / "A traiter" selon le type, pas un null).
  const { data: defaultOpt } = await sb
    .from("status_options")
    .select("libelle")
    .eq("scope", "obligation")
    .eq("type_code", payload.type)
    .eq("statut_logique", "A_FAIRE")
    .eq("actif", true)
    .order("ordre")
    .limit(1)
    .maybeSingle();

  // 3. Insert
  const { data: inserted, error } = await sb
    .from("obligations")
    .insert({
      client_id: payload.clientId,
      type: payload.type,
      periode: payload.periode,
      annee: payload.annee,
      statut_logique: "A_FAIRE",
      statut_detail: defaultOpt?.libelle ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { obligationId: inserted.id };
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
  // Perf : optimistic update côté tracker. Pas de revalidatePath.
}

/**
 * Met à jour l'état facturation sur une obligation. Utilisé par le tracker
 * pour le suivi facturation juridique (AGO_DEPOT principalement).
 * etat = null : réinitialise.
 */
export async function setObligationFacturation(
  obligationId: string,
  etat: "a_facturer" | "facturee" | "sans_facture" | null
) {
  const sb = await createClient();
  const { error } = await sb
    .from("obligations")
    .update({ etat_facturation: etat })
    .eq("id", obligationId);
  if (error) throw new Error(error.message);
  revalidateFinanceViews();
}
