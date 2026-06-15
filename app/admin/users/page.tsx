import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import UserRow from "./user-row";

export const dynamic = "force-dynamic";

/**
 * Page admin - gestion des utilisateurs MoonCRM.
 * Accessible uniquement aux profiles.is_admin = true (vérifié par le
 * middleware ET par la RLS sur la table profiles).
 *
 * Workflow :
 *   1. Quelqu'un s'inscrit (signUp) avec un email @moonexpertise.fr
 *      → row profiles auto-créée avec approved=false
 *   2. L'utilisateur tombe sur /en-attente jusqu'à approbation
 *   3. Un admin (Benjamin) ouvre cette page et clique "Approuver"
 *   4. L'utilisateur peut maintenant accéder à l'app
 */
export default async function AdminUsersPage() {
  const sb = await createClient();
  // select("*") : tolère que la migration 0078 (colonne role) ne soit pas
  // encore appliquée — l'UI retombe sur resolveRole(is_admin).
  const { data: profiles } = await sb
    .from("profiles")
    .select("*")
    .order("approved", { ascending: true }) // En attente d'abord
    .order("created_at", { ascending: false });

  const pending = (profiles ?? []).filter((p) => !p.approved);
  const approved = (profiles ?? []).filter((p) => p.approved);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Utilisateurs"
        description={
          <>
            Gestion des comptes MoonCRM, approbation des nouvelles inscriptions.
            Seuls les emails <code className="text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-md border border-zinc-200/60 dark:border-white/[0.08]">@moonexpertise.fr</code> peuvent s&apos;inscrire.
          </>
        }
        actions={
          <Link
            href="/admin/roles"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-sm transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Rôles & permissions
          </Link>
        }
      />

      {pending.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            En attente d&apos;approbation ({pending.length})
          </h2>
          <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-b from-amber-50/40 to-white shadow-card divide-y divide-amber-100/60 overflow-hidden">
            {pending.map((p) => (
              <UserRow key={p.id} profile={p} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Comptes approuvés ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-card p-10 text-center text-sm text-zinc-500">
            Aucun compte approuvé encore.
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-card divide-y divide-zinc-100 overflow-hidden">
            {approved.map((p) => (
              <UserRow key={p.id} profile={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
