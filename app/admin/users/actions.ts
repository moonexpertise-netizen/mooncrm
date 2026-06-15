"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { isRole, type Role } from "@/lib/permissions";

/**
 * Approuve un compte EN LUI ATTRIBUANT UN RÔLE. Réservé aux comptes ayant la
 * permission manage_users (admins). Stocke l'approuveur + la date pour audit.
 * is_admin est synchronisé automatiquement par trigger DB (= role 'admin').
 */
export async function approveUser(userId: string, role: Role) {
  await requirePermission("manage_users");
  if (!isRole(role)) throw new Error("Rôle invalide");

  const sb = await createClient();
  const {
    data: { user: actor },
  } = await sb.auth.getUser();
  if (!actor) throw new Error("Non authentifié");

  const { error } = await sb
    .from("profiles")
    .update({
      approved: true,
      role,
      approved_at: new Date().toISOString(),
      approved_by: actor.id,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

/**
 * Change le rôle d'un compte déjà approuvé. Garde-fou : on ne peut pas
 * retirer son PROPRE rôle admin (anti auto-lockout).
 */
export async function setRole(userId: string, role: Role) {
  await requirePermission("manage_users");
  if (!isRole(role)) throw new Error("Rôle invalide");

  const sb = await createClient();
  const {
    data: { user: actor },
  } = await sb.auth.getUser();
  if (!actor) throw new Error("Non authentifié");
  if (actor.id === userId && role !== "admin") {
    throw new Error("Vous ne pouvez pas retirer votre propre rôle Admin.");
  }

  const { error } = await sb.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

/**
 * Révoque l'approbation d'un compte (plus d'accès). Le compte auth.users n'est
 * pas supprimé. Garde-fou : on ne peut pas se révoquer soi-même.
 */
export async function revokeUser(userId: string) {
  await requirePermission("manage_users");

  const sb = await createClient();
  const {
    data: { user: actor },
  } = await sb.auth.getUser();
  if (!actor) throw new Error("Non authentifié");
  if (actor.id === userId) {
    throw new Error("Vous ne pouvez pas révoquer votre propre compte.");
  }

  const { error } = await sb
    .from("profiles")
    .update({ approved: false, approved_at: null, approved_by: null })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}
