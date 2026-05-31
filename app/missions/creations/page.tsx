import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import CreationsTable, { type CreationRow, type CreationStatut } from "./creations-table";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Module "Creations" - meme pattern que IR/CAA :
 *   - Vue Base : pills annees (mais 1 max par dossier, comportement radio)
 *   - Vue Annee : statut creation pour les dossiers souscrits a l'annee
 *
 * Source : clients.creation_annee + clients.creation_statut (1 par dossier).
 * Cf. migrations 0055 + 0056.
 */

type ClientRaw = {
  id: string;
  slug: string;
  denomination: string;
  forme: string | null;
  pipeline_statut: string | null;
  creation_annee?: number | null;
  creation_statut?: string | null;
};

export default async function CreationsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; view?: string; center?: string }>;
}) {
  const sp = await searchParams;
  const isBaseView = sp.view === "base" || (!sp.year && sp.view !== "year");
  const yearParam = sp.year ? parseInt(sp.year, 10) : null;
  const centerParam = sp.center ? parseInt(sp.center, 10) : null;
  const center =
    yearParam && !Number.isNaN(yearParam)
      ? yearParam
      : centerParam && !Number.isNaN(centerParam)
        ? centerParam
        : CURRENT_YEAR;
  const selectedYear = yearParam && !Number.isNaN(yearParam) ? yearParam : center;
  const AVAILABLE_YEARS = [center - 1, center, center + 1];
  // Fenetre elargie a 6 ans pour les pills de souscription en vue Base.
  const PILL_YEARS = [center - 2, center - 1, center, center + 1, center + 2, center + 3];

  const sb = await createClient();

  // Query : tous les dossiers en origine '1 - Création', avec leur annee
  // de creation + statut courant.
  const fullSel = "id, slug, denomination, forme, pipeline_statut, creation_annee, creation_statut";
  const fallbackSel = "id, slug, denomination, forme, pipeline_statut";

  let dataRaw: ClientRaw[] = [];
  const r1 = await sb
    .from("clients")
    .select(fullSel)
    .eq("origine", "1 - Création")
    .order("denomination", { ascending: true });
  if (r1.error) {
    // eslint-disable-next-line no-console
    console.error("[/missions/creations] erreur principale :", r1.error.message);
    const r2 = await sb
      .from("clients")
      .select(fallbackSel)
      .eq("origine", "1 - Création")
      .order("denomination", { ascending: true });
    if (r2.error) {
      // eslint-disable-next-line no-console
      console.error("[/missions/creations] erreur fallback :", r2.error.message);
    }
    dataRaw = (r2.data ?? []).map((c) => ({
      ...c,
      creation_annee: null,
      creation_statut: null,
    })) as ClientRaw[];
  } else {
    dataRaw = (r1.data ?? []) as ClientRaw[];
  }

  const rows: CreationRow[] = dataRaw.map((c) => ({
    id: c.id,
    slug: c.slug,
    denomination: c.denomination,
    forme: c.forme,
    pipeline_statut: c.pipeline_statut,
    creation_annee: c.creation_annee ?? null,
    creation_statut: (c.creation_statut ?? null) as CreationStatut | null,
  }));

  const description = isBaseView
    ? "Pilotage des créations de sociétés · Vue d'ensemble"
    : `Pilotage des créations de sociétés · Exercice ${selectedYear}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Créations · Suivi des dossiers" description={description} />
      <CreationsTable
        rows={rows}
        mode={isBaseView ? "base" : "year"}
        selectedYear={selectedYear}
        center={center}
        years={AVAILABLE_YEARS}
        pillYears={PILL_YEARS}
      />
    </div>
  );
}
