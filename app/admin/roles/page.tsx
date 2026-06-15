import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import RolesMatrix from "./roles-matrix";

export const dynamic = "force-dynamic";

/**
 * Page admin "Rôles & permissions" : matrice éditable rôle × permission.
 * Accès réservé manage_users (middleware /admin + RLS role_permissions).
 */
export default async function AdminRolesPage() {
  const sb = await createClient();
  const { data: rows } = await sb.from("role_permissions").select("role, permission");

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Rôles & permissions"
        description="Définissez ce que chaque profil a le droit de faire. Le rôle Admin a toujours accès à tout. Les changements s'appliquent immédiatement."
        actions={
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-sm transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Utilisateurs
          </Link>
        }
      />
      <RolesMatrix rows={rows ?? []} />
    </div>
  );
}
