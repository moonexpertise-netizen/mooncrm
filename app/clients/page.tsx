import { createClient } from "@/lib/supabase/server";
import ClientsTable, { type ClientRow } from "./clients-table";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, slug, denomination, siren, forme, activite, regime, pipeline_statut, arr, honoraires_compta, groupes(nom)"
    )
    .order("denomination");

  if (error) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        Erreur de chargement : {error.message}
      </div>
    );
  }

  const rows: ClientRow[] = (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    denomination: c.denomination,
    siren: c.siren,
    forme: c.forme,
    activite: c.activite,
    regime: c.regime,
    pipeline_statut: c.pipeline_statut,
    arr: c.arr ?? 0,
    honoraires_compta: c.honoraires_compta ?? 0,
    // Supabase typing: la relation single retourne un objet, pas un tableau
    groupe_nom:
      (c.groupes as unknown as { nom: string } | null)?.nom ?? null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {rows.length} fiche{rows.length > 1 ? "s" : ""} au total.
          </p>
        </div>
        <a
          href="/clients/nouveau"
          className="px-3 py-2 rounded-md bg-[#0D1122] text-white text-sm font-medium hover:bg-[#0D1122]/85 transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <span className="text-base leading-none">+</span> Nouveau client
        </a>
      </div>
      <ClientsTable rows={rows} />
    </div>
  );
}
