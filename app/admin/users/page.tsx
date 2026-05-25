import { createClient } from "@/lib/supabase/server";
import UserRow from "./user-row";

export const dynamic = "force-dynamic";

/**
 * Page admin — gestion des utilisateurs MoonCRM.
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
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, email, approved, is_admin, created_at, approved_at")
    .order("approved", { ascending: true }) // En attente d'abord
    .order("created_at", { ascending: false });

  const pending = (profiles ?? []).filter((p) => !p.approved);
  const approved = (profiles ?? []).filter((p) => p.approved);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestion des comptes MoonCRM · approbation des nouvelles inscriptions.
          Seuls les emails <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">@moonexpertise.fr</code> peuvent s&apos;inscrire.
        </p>
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-amber-700 uppercase tracking-wide mb-2">
            En attente d&apos;approbation ({pending.length})
          </h2>
          <div className="rounded-lg border bg-amber-50/30 divide-y divide-amber-100">
            {pending.map((p) => (
              <UserRow key={p.id} profile={p} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-zinc-700 uppercase tracking-wide mb-2">
          Comptes approuvés ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun compte approuvé encore.
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y divide-zinc-100">
            {approved.map((p) => (
              <UserRow key={p.id} profile={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
