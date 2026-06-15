import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveRole, hasPermission, type Permission, type Role } from "@/lib/permissions";

/**
 * Helpers d'autorisation côté SERVER (server components + server actions).
 *
 * À utiliser au début des server actions sensibles :
 *   await requirePermission("edit_parametrage");
 *
 * La vérité du rôle est lue en base (profiles.role) à chaque appel : impossible
 * à falsifier depuis le client.
 */

export async function getMyRole(): Promise<Role | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("profiles")
    .select("role, is_admin, approved")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || data.approved !== true) return null;
  return resolveRole(data as { role?: string | null; is_admin?: boolean | null });
}

export async function can(perm: Permission): Promise<boolean> {
  const role = await getMyRole();
  return role ? hasPermission(role, perm) : false;
}

/** Lève une erreur si l'utilisateur courant n'a pas la permission. */
export async function requirePermission(perm: Permission): Promise<void> {
  if (!(await can(perm))) {
    throw new Error("Action non autorisée pour votre profil.");
  }
}
