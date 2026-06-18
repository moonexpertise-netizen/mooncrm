"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

/**
 * Server actions de la saisie des temps (feuille de temps).
 * Réservé au droit `saisir_temps`. Chacun ne crée/supprime QUE ses lignes
 * (garanti par la RLS time_entries, cf. migration 0080).
 */

export type CreateTimeEntryInput = {
  /** Dossier comptable rattaché. null = travail « Autre » (hors dossier). */
  clientId: string | null;
  /** Catégorie quand clientId est null (Interne, Commercial...). */
  categorieAutre: string | null;
  activiteId: string | null;
  /** Jour de la saisie au format YYYY-MM-DD. */
  dateJour: string;
  dureeMinutes: number;
  /** Exercice de rattachement (= année du forfait visé). */
  annee: number;
  commentaire: string | null;
  facturable: boolean;
};

export async function createTimeEntry(
  input: CreateTimeEntryInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission("saisir_temps");
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) throw new Error("Non authentifié.");

    // Règle métier (le CHECK en base la garantit aussi) : dossier OU Autre+commentaire.
    const isAutre = !input.clientId;
    const commentaire = input.commentaire?.trim() || null;
    if (isAutre && (!input.categorieAutre || !commentaire)) {
      throw new Error(
        "Hors dossier comptable : choisissez une catégorie « Autre » et saisissez un commentaire."
      );
    }
    if (!Number.isFinite(input.dureeMinutes) || input.dureeMinutes <= 0) {
      throw new Error("Durée invalide.");
    }
    if (input.dureeMinutes > 1440) throw new Error("Durée maximale : 24 h.");

    const { error } = await sb.from("time_entries").insert({
      user_id: user.id,
      client_id: input.clientId,
      categorie_autre: isAutre ? input.categorieAutre : null,
      activite_id: input.activiteId,
      date_jour: input.dateJour,
      duree_minutes: Math.round(input.dureeMinutes),
      annee: input.annee,
      commentaire,
      facturable: input.facturable,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/temps");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateTimeEntry(
  id: string,
  input: CreateTimeEntryInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission("saisir_temps");
    const sb = await createClient();

    const isAutre = !input.clientId;
    const commentaire = input.commentaire?.trim() || null;
    if (isAutre && (!input.categorieAutre || !commentaire)) {
      throw new Error(
        "Hors dossier comptable : choisissez une catégorie « Autre » et saisissez un commentaire."
      );
    }
    if (!Number.isFinite(input.dureeMinutes) || input.dureeMinutes <= 0) {
      throw new Error("Durée invalide.");
    }
    if (input.dureeMinutes > 1440) throw new Error("Durée maximale : 24 h.");

    // La RLS limite la mise à jour à ses propres lignes. On ne touche pas user_id.
    const { error } = await sb
      .from("time_entries")
      .update({
        client_id: input.clientId,
        categorie_autre: isAutre ? input.categorieAutre : null,
        activite_id: input.activiteId,
        date_jour: input.dateJour,
        duree_minutes: Math.round(input.dureeMinutes),
        annee: input.annee,
        commentaire,
        facturable: input.facturable,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/temps");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteTimeEntry(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission("saisir_temps");
    const sb = await createClient();
    // La RLS limite la suppression à ses propres lignes.
    const { error } = await sb.from("time_entries").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/temps");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
