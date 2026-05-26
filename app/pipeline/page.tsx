import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import PipelineKanban, { type PipelineCard } from "./kanban";
import type { PipelineStatut } from "@/app/clients/[slug]/actions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const sb = await createClient();
  const { data, error } = await sb
    .from("clients")
    .select("id, slug, denomination, siren, forme, activite, arr, pipeline_statut")
    .order("denomination");

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
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
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        description={`${cards.length} dossier${cards.length > 1 ? "s" : ""} · glisse une carte pour changer le statut`}
      />
      <PipelineKanban cards={cards} />
    </div>
  );
}
