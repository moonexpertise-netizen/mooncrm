import { createClient } from "@/lib/supabase/server";
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
      <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {cards.length} dossier{cards.length > 1 ? "s" : ""} · glisse une carte pour changer le statut.
        </p>
      </div>
      <PipelineKanban cards={cards} />
    </div>
  );
}
