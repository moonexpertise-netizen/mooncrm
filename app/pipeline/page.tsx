import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import PipelineKanban, { type PipelineCard } from "./kanban";
import type { PipelineStatut } from "@/app/clients/[slug]/actions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const sb = await createClient();

  // Defensive : tente de selectionner pipeline_changed_at (migration 0047)
  // pour le tri par arrivee. Si la colonne n'existe pas encore en DB,
  // fallback sur tri alphabetique sans casser la page.
  type ClientRow = {
    id: string;
    slug: string;
    denomination: string;
    siren: string | null;
    forme: string | null;
    activite: string | null;
    arr: number | null;
    pipeline_statut: string | null;
    pipeline_changed_at?: string | null;
    mois_signature: string | null;
  };

  let data: ClientRow[] | null = null;
  let error: { message: string } | null = null;
  // mois_signature : disponible depuis migration 0016, garanti present.
  // Utilise pour trier la colonne "7 - LDM signee" par date de signature.
  const baseCols =
    "id, slug, denomination, siren, forme, activite, arr, pipeline_statut, mois_signature";

  // Tentative 1 : avec pipeline_changed_at (migration 0047 appliquee)
  const first = await sb
    .from("clients")
    .select(`${baseCols}, pipeline_changed_at`)
    .order("pipeline_changed_at", { ascending: false, nullsFirst: false })
    .order("denomination", { ascending: true });
  if (first.error) {
    // Toute erreur sur la 1ere tentative -> retry sans pipeline_changed_at.
    // Couvre le cas migration non appliquee (column does not exist) et
    // tout autre cas inattendu. Le retry est sur des colonnes garanties
    // depuis 0001 + 0035 (slug).
    const fallback = await sb
      .from("clients")
      .select(baseCols)
      .order("denomination");
    data = (fallback.data as unknown as ClientRow[]) ?? null;
    error = fallback.error;
  } else {
    data = (first.data as unknown as ClientRow[]) ?? null;
    error = null;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
        Erreur de chargement : {error.message}
      </div>
    );
  }

  const cards: PipelineCard[] = (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    denomination: c.denomination,
    siren: c.siren,
    forme: c.forme,
    activite: c.activite,
    arr: Number(c.arr ?? 0),
    pipeline_statut: c.pipeline_statut as PipelineStatut | null,
    pipeline_changed_at: c.pipeline_changed_at ?? null,
    mois_signature: c.mois_signature ?? null,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pipeline"
        description={`${cards.length} dossier${cards.length > 1 ? "s" : ""}, glisse une carte pour changer le statut`}
      />
      <PipelineKanban cards={cards} />
    </div>
  );
}
