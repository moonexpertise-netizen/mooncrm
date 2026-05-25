"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Approuve un compte utilisateur. Réservé aux admins (vérifié côté RLS et
 * côté middleware). Stocke l'approuveur + la date pour audit.
 */
export async function approveUser(userId: string) {
  const sb = await createClient();
  const { data: { user: actor } } = await sb.auth.getUser();
  if (!actor) throw new Error("Non authentifié");

  const { error } = await sb
    .from("profiles")
    .update({ approved: true, approved_at: new Date().toISOString(), approved_by: actor.id })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

/**
 * Révoque l'approbation d'un compte (l'utilisateur ne peut plus accéder).
 * Le compte auth.users n'est pas supprimé, juste mis hors-ligne logiquement.
 */
export async function revokeUser(userId: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("profiles")
    .update({ approved: false, approved_at: null, approved_by: null })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

/**
 * Promeut un compte au statut admin. Le futur admin peut alors approuver
 * d'autres comptes via cette même page.
 */
export async function setAdmin(userId: string, isAdmin: boolean) {
  const sb = await createClient();
  const { error } = await sb
    .from("profiles")
    .update({ is_admin: isAdmin })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}
