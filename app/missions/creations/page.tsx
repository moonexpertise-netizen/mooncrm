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

type ClientCreaRaw = {
  id: string;
  slug: string;
  denomination: string;
  forme: string | null;
  pipeline_statut: string | null;
  mois_signature: string | null;
  creation_statut?: string | null;
  debut_obligations: string | null;
};

export default async function CreationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const sb = await createClient();

  // Query principale : avec creation_statut (migration 0055). Fallback sans
  // si la colonne n'existe pas encore. On evite la jointure client_contacts
  // ici (table de liaison many-to-many qui rend le SELECT complexe) ; le
  // dirigeant pourra etre charge en V2 via une 2e query si besoin.
  const fullSel = "id, slug, denomination, forme, pipeline_statut, mois_signature, creation_statut, debut_obligations";
  const fallbackSel = "id, slug, denomination, forme, pipeline_statut, mois_signature, debut_obligations";

  let dataRaw: ClientCreaRaw[] = [];
  const r1 = await sb
    .from("clients")
    .select(fullSel)
    .eq("origine", "1 - Création")
    .order("denomination", { ascending: true });
  if (r1.error) {
    // eslint-disable-next-line no-console
    console.error("[/missions/creations] erreur query principale :", r1.error.message);
    const r2 = await sb
      .from("clients")
      .select(fallbackSel)
      .eq("origine", "1 - Création")
      .order("denomination", { ascending: true });
    if (r2.error) {
      // eslint-disable-next-line no-console
      console.error("[/missions/creations] erreur fallback :", r2.error.message);
    }
    dataRaw = (r2.data ?? []).map((c) => ({ ...c, creation_statut: null })) as ClientCreaRaw[];
  } else {
    dataRaw = (r1.data ?? []) as ClientCreaRaw[];
  }

  const rows: CreationRow[] = dataRaw.map((c) => ({
    id: c.id,
    slug: c.slug,
    denomination: c.denomination,
    forme: c.forme,
    pipeline_statut: c.pipeline_statut,
    mois_signature: c.mois_signature,
    debut_obligations: c.debut_obligations,
    dirigeant: null,
    creation_statut: (c.creation_statut ?? null) as CreationStatut | null,
  }));

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
