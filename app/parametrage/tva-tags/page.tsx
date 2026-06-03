import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import TvaTagsManager, { type TvaTagRow } from "./manager";

export const dynamic = "force-dynamic";

/**
 * Parametrage des etiquettes TVA (vitesse de realisation).
 *
 * CRUD libre : le user cree/renomme/recolore/desactive/supprime les tags
 * qu'il veut. Ces tags sont ensuite affectes a chaque client TVA mensuelle
 * (1 tag max par client) via la fiche client ou le tracker TVA.
 *
 * Cf. migration 0059 + actions.ts pour les server actions.
 */
export default async function TvaTagsPage() {
  const sb = await createClient();
  const { data: tags } = await sb
    .from("tva_tags")
    .select("id, label, color, ordre, actif")
    .order("ordre");

  // Counts par tag : nombre de clients ayant ce tag attribue. Affiche dans la
  // liste pour transparence ("Express · 12 dossiers"). Utile aussi avant
  // suppression (warning si tag utilise).
  const { data: clientCounts } = await sb
    .from("clients")
    .select("tva_tag_id")
    .not("tva_tag_id", "is", null);
  const counts = new Map<string, number>();
  for (const c of clientCounts ?? []) {
    const tid = (c as { tva_tag_id: string }).tva_tag_id;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }

  const rows: TvaTagRow[] = (tags ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    color: t.color,
    ordre: t.ordre,
    actif: t.actif,
    clientCount: counts.get(t.id) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Étiquettes TVA"
        description="Catégorise tes dossiers TVA mensuelles selon la vitesse de réalisation (Express, Standard, + longue, …). Les étiquettes apparaissent dans le tracker TVA pour filtrer."
      />
      <TvaTagsManager initialRows={rows} />
    </div>
  );
}
