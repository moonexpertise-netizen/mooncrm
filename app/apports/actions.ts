"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";

/**
 * Server actions des apports d'affaires (commissions dues aux apporteurs).
 * Lecture réservée au niveau finance ; écriture edit_facturation. Cf.
 * migration 0091.
 */

export type ApportMode = "facture" | "carte_cadeau";

export async function createApport(input: {
  clientId: string;
  apporteur: string;
  montant: number;
  mode: ApportMode;
  note?: string | null;
}) {
  await requirePermission("edit_facturation");
  if (!input.apporteur?.trim()) throw new Error("Apporteur obligatoire");
  const sb = await createClient();
  const { error } = await sb.from("apports_affaires").insert({
    client_id: input.clientId,
    apporteur: input.apporteur.trim(),
    montant: input.montant,
    mode: input.mode,
    note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/apports");
  revalidatePath(`/clients/${input.clientId}`);
}

export async function updateApport(
  id: string,
  patch: { apporteur?: string; montant?: number; mode?: ApportMode; note?: string | null }
) {
  await requirePermission("edit_facturation");
  const sb = await createClient();
  const clean: Record<string, string | number | null> = {};
  if (patch.apporteur !== undefined) clean.apporteur = patch.apporteur.trim();
  if (patch.montant !== undefined) clean.montant = patch.montant;
  if (patch.mode !== undefined) clean.mode = patch.mode;
  if (patch.note !== undefined) clean.note = patch.note?.trim() || null;
  const { error } = await sb.from("apports_affaires").update(clean).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/apports");
}

/** Marque un apport réglé / à régler (horodate le règlement). */
export async function setApportRegle(id: string, regle: boolean) {
  await requirePermission("edit_facturation");
  const sb = await createClient();
  const { error } = await sb
    .from("apports_affaires")
    .update({ regle, regle_at: regle ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/apports");
}

export async function deleteApport(id: string) {
  await requirePermission("edit_facturation");
  const sb = await createClient();
  const { error } = await sb.from("apports_affaires").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/apports");
}
