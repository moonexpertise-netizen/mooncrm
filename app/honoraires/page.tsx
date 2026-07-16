import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import HonorairesGrid, { type HonoRow } from "./honoraires-grid";

export const dynamic = "force-dynamic";

/**
 * Grille des honoraires globale : 1 ligne par dossier, colonnes par nature
 * d'honoraires (compta mensuel, bilan, pilotage/TDB, juridique) + MRR/ARR.
 *
 * Toutes les données viennent de `clients` (aucune table dédiée) :
 *   - honoraires_compta            forfait comptable MENSUEL
 *   - type_honos_bilans/forfait_bilan   bilan ANNUEL (si "Facturés")
 *   - tdb_periode/tdb_honos_periode/forfait_pilotage  pilotage (équiv. mensuel)
 *   - type_honos_jur/honoraires_jur     juridique ANNUEL (si "Facturés")
 *
 * Édition inline (montants uniquement) via updateClient — même mécanique
 * auditée que la fiche client. Les types Facturés/Inclus/Non souscrit se
 * changent sur la fiche.
 */
export default async function HonorairesPage() {
  const sb = await createClient();
  const { data, error } = await sb
    .from("clients")
    .select(
      "id, slug, denomination, pipeline_statut, origine, honoraires_compta, type_honos_bilans, forfait_bilan, tdb_periode, tdb_honos_periode, forfait_pilotage, oss_periode, oss_honos_trimestre, forfait_oss, type_honos_jur, honoraires_jur, mrr, arr"
    )
    .order("denomination", { ascending: true });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
        Erreur de chargement : {error.message}
      </div>
    );
  }

  const rows: HonoRow[] = (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    denomination: c.denomination,
    pipeline_statut: c.pipeline_statut,
    origine: c.origine,
    honoraires_compta: Number(c.honoraires_compta ?? 0),
    type_honos_bilans: c.type_honos_bilans,
    forfait_bilan: Number(c.forfait_bilan ?? 0),
    tdb_periode: c.tdb_periode,
    tdb_honos_periode: Number(c.tdb_honos_periode ?? 0),
    forfait_pilotage: Number(c.forfait_pilotage ?? 0),
    oss_periode: c.oss_periode,
    oss_honos_trimestre: Number(c.oss_honos_trimestre ?? 0),
    forfait_oss: Number(c.forfait_oss ?? 0),
    type_honos_jur: c.type_honos_jur,
    honoraires_jur: Number(c.honoraires_jur ?? 0),
    mrr: Number(c.mrr ?? 0),
    arr: Number(c.arr ?? 0),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Honoraires"
        description="Grille globale des forfaits par dossier : compta, bilan, pilotage, juridique. Clic sur un montant pour l'éditer."
      />
      <HonorairesGrid rows={rows} />
    </div>
  );
}
