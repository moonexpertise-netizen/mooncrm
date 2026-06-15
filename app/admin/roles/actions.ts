"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { isRole, isPermission } from "@/lib/permissions";

/**
 * Active/désactive une permission pour un rôle (table role_permissions).
 * Réservé aux comptes manage_users (admins). Le rôle 'admin' n'est PAS
 * modifiable (superadmin = toujours tout → pas de verrouillage possible).
 */
export async function setRolePermission(role: string, permission: string, enabled: boolean) {
  await requirePermission("manage_users");
  if (!isRole(role) || !isPermission(permission)) throw new Error("Paramètre invalide");
  if (role === "admin") throw new Error("Le rôle Admin n'est pas modifiable (accès complet par définition).");

  const sb = await createClient();
  if (enabled) {
    const { error } = await sb
      .from("role_permissions")
      .upsert({ role, permission }, { onConflict: "role,permission" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb
      .from("role_permissions")
      .delete()
      .eq("role", role)
      .eq("permission", permission);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/admin/roles");
}
