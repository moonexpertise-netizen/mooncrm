import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HistoriqueList from "./historique-list";

export const dynamic = "force-dynamic";

/**
 * Onglet "Historique" de la fiche client. Liste chronologique de toutes
 * les modifications captees par le trigger client_audit_log (cf. migration
 * 0072).
 *
 * Filtres cote client : Tous / Pipeline / Honoraires / Autres. Bouton
 * "Vider l'historique" en haut a droite.
 */
export default async function HistoriquePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = await createClient();

  const { data: client } = await sb
    .from("clients")
    .select("id, denomination, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!client) return notFound();

  const { data: entries } = await sb
    .from("client_audit_log")
    .select("id, field, old_value, new_value, changed_at, changed_by_email, source, motif")
    .eq("client_id", client.id)
    .order("changed_at", { ascending: false })
    .limit(500);

  return (
    <HistoriqueList
      clientId={client.id}
      clientSlug={client.slug}
      entries={entries ?? []}
    />
  );
}
