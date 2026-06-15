import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
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
      <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
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
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        description={`${rows.length} fiche${rows.length > 1 ? "s" : ""} au total`}
        actions={
          <Link
            href="/clients/nouveau"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium shadow-card hover:bg-zinc-800 dark:hover:bg-white hover:shadow-card-hover transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" />
            Nouveau client
          </Link>
        }
      />
      <ClientsTable rows={rows} />
    </div>
  );
}
