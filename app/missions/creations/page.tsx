import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import CreationsTable, { type CreationRow, type CreationStatut } from "./creations-table";

export const dynamic = "force-dynamic";

/**
 * Module "Creations" - suivi des dossiers en cours de creation de societe.
 * Inclut uniquement les clients avec origine = '1 - Création'.
 *
 * Source de verite : creation_statut sur clients (migration 0055). Auto-init
 * a 'a_traiter' via trigger DB quand origine bascule sur '1 - Création'.
 */

export default async function CreationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const sb = await createClient();

  // Defensive : si la colonne creation_statut n'existe pas (migration 0055
  // pas appliquee), on fallback sans cette colonne.
  const fullSel = "id, slug, denomination, forme, pipeline_statut, mois_signature, creation_statut, debut_obligations, interlocuteurs:client_contacts(prenom, nom, qualite, ordre)";
  const fallbackSel = "id, slug, denomination, forme, pipeline_statut, mois_signature, debut_obligations, interlocuteurs:client_contacts(prenom, nom, qualite, ordre)";

  let dataRaw: unknown[] | null;
  const r1 = await sb
    .from("clients")
    .select(fullSel)
    .eq("origine", "1 - Création")
    .order("denomination", { ascending: true });
  if (r1.error) {
    const r2 = await sb
      .from("clients")
      .select(fallbackSel)
      .eq("origine", "1 - Création")
      .order("denomination", { ascending: true });
    dataRaw = (r2.data ?? []).map((c) => ({ ...c, creation_statut: null }));
  } else {
    dataRaw = r1.data;
  }

  type ClientCreaRaw = {
    id: string;
    slug: string;
    denomination: string;
    forme: string | null;
    pipeline_statut: string | null;
    mois_signature: string | null;
    creation_statut?: string | null;
    debut_obligations: string | null;
    interlocuteurs: Array<{ prenom: string | null; nom: string; qualite: string | null; ordre: number | null }> | null;
  };

  const rows: CreationRow[] = ((dataRaw ?? []) as ClientCreaRaw[]).map((c) => {
    // Premier interlocuteur trie par ordre (ou null si aucun)
    const contacts = (c.interlocuteurs ?? []).slice().sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
    const dirigeant = contacts[0]
      ? [contacts[0].prenom, contacts[0].nom].filter(Boolean).join(" ")
      : null;
    return {
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      forme: c.forme,
      pipeline_statut: c.pipeline_statut,
      mois_signature: c.mois_signature,
      debut_obligations: c.debut_obligations,
      dirigeant,
      creation_statut: (c.creation_statut ?? null) as CreationStatut | null,
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Créations · Suivi des dossiers"
        description="Pilotage des créations de sociétés · uniquement les dossiers d'origine « 1 - Création »"
      />
      <CreationsTable rows={rows} initialFilter={sp.filter ?? "all"} />
    </div>
  );
}
