import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import CaaTable, { type CaaRow, type CaaStatusOption } from "./caa-table";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;
const AVAILABLE_YEARS = [2024, 2025, 2026, 2027];

/**
 * Page Mission CAA : missions de Commissaire aux Apports.
 * 1 ligne par societe a CAAter, 1 cellule statut par annee.
 */
export default async function CaaPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const yearParam = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;
  const selectedYear = AVAILABLE_YEARS.includes(yearParam) ? yearParam : CURRENT_YEAR;

  const sb = await createClient();

  const [
    { data: clients },
    { data: obligations },
    { data: statusOpts },
  ] = await Promise.all([
    sb
      .from("clients_caa")
      .select(
        "id, slug, denomination, siren, forme, dirigeant_nom, dirigeant_email, dirigeant_telephone, ldm_statut"
      )
      .order("denomination", { ascending: true }),
    sb
      .from("caa_obligations")
      .select("client_caa_id, annee, statut_logique, statut_detail")
      .eq("annee", selectedYear),
    sb
      .from("status_options")
      .select("type_code, libelle, statut_logique, color, ordre")
      .eq("scope", "caa")
      .eq("actif", true)
      .order("ordre"),
  ]);

  const obByClient = new Map<
    string,
    { libelle: string | null; statut_logique: string }
  >();
  for (const o of obligations ?? []) {
    obByClient.set(o.client_caa_id, {
      libelle: o.statut_detail,
      statut_logique: o.statut_logique,
    });
  }

  const rows: CaaRow[] = (clients ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    denomination: c.denomination,
    siren: c.siren,
    forme: c.forme,
    dirigeant_nom: c.dirigeant_nom,
    dirigeant_email: c.dirigeant_email,
    dirigeant_telephone: c.dirigeant_telephone,
    ldm_statut: c.ldm_statut,
    caa: obByClient.get(c.id) ?? null,
  }));

  const options: CaaStatusOption[] = (statusOpts ?? []).map((o) => ({
    libelle: o.libelle,
    statut_logique: o.statut_logique as CaaStatusOption["statut_logique"],
    color: o.color ?? null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="CAA · Commissaire aux Apports"
        description={`Missions de commissariat aux apports · Exercice ${selectedYear}`}
      />
      <CaaTable
        rows={rows}
        annee={selectedYear}
        years={AVAILABLE_YEARS}
        statusOptions={options}
      />
    </div>
  );
}
