import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import CaaTable, { type CaaCell, type CaaRow, type CaaStatusOption } from "./caa-table";

export const dynamic = "force-dynamic";

// Selecteur d'annee : fenetre glissante de 3 ans centree sur "center".
// Cf. IR page.tsx pour la logique detaillee.
const CURRENT_YEAR = new Date().getFullYear();

/**
 * Page Mission CAA. Deux vues comme IR :
 *   - Base : pills d'annees souscrites par client.
 *   - Annee : statut CAA de l'annee pour chaque client (N/A si non souscrit).
 */
export default async function CaaPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; view?: string; center?: string }>;
}) {
  const sp = await searchParams;
  const isBaseView = sp.view === "base" || (!sp.year && sp.view !== "year");
  const yearParam = sp.year ? parseInt(sp.year, 10) : null;
  const centerParam = sp.center ? parseInt(sp.center, 10) : null;
  const center = (yearParam && !Number.isNaN(yearParam))
    ? yearParam
    : (centerParam && !Number.isNaN(centerParam))
      ? centerParam
      : CURRENT_YEAR;
  const selectedYear = yearParam && !Number.isNaN(yearParam) ? yearParam : center;
  const AVAILABLE_YEARS = [center - 1, center, center + 1];

  const sb = await createClient();

  // Query defensive : si etat_facturation n'existe pas (migration 0050
  // pas appliquee), on retombe sur une query sans cette colonne.
  type ObRow = {
    client_caa_id: string;
    annee: number;
    statut_logique: string;
    statut_detail: string | null;
    etat_facturation: string | null;
  };
  const [{ data: clients }, obligationsRes, { data: statusOpts }] = await Promise.all([
    sb
      .from("clients_caa")
      .select(
        "id, slug, denomination, siren, forme, dirigeant_nom, dirigeant_email, dirigeant_telephone, ldm_statut"
      )
      .order("denomination", { ascending: true }),
    sb
      .from("caa_obligations")
      .select("client_caa_id, annee, statut_logique, statut_detail, etat_facturation"),
    sb
      .from("status_options")
      .select("type_code, libelle, statut_logique, color, ordre")
      .eq("scope", "caa")
      .eq("actif", true)
      .order("ordre"),
  ]);
  let obligations: ObRow[] | null = obligationsRes.data as ObRow[] | null;
  if (obligationsRes.error) {
    const { data: fb } = await sb
      .from("caa_obligations")
      .select("client_caa_id, annee, statut_logique, statut_detail");
    obligations = (fb ?? []).map((r) => ({ ...r, etat_facturation: null })) as ObRow[];
  }

  // Index : client_caa_id -> Map<year, cell>
  const obByClient = new Map<string, Map<number, CaaCell>>();
  for (const o of obligations ?? []) {
    if (!obByClient.has(o.client_caa_id)) obByClient.set(o.client_caa_id, new Map());
    obByClient.get(o.client_caa_id)!.set(o.annee, {
      annee: o.annee,
      libelle: o.statut_detail,
      statut_logique: o.statut_logique as CaaStatusOption["statut_logique"],
      etat_facturation: (o.etat_facturation ?? null) as CaaCell["etat_facturation"],
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
    obligations: obByClient.get(c.id) ?? new Map(),
  }));

  const options: CaaStatusOption[] = (statusOpts ?? []).map((o) => ({
    libelle: o.libelle,
    statut_logique: o.statut_logique as CaaStatusOption["statut_logique"],
    color: o.color ?? null,
  }));

  const description = isBaseView
    ? "Missions de commissariat aux apports · Vue d'ensemble"
    : `Missions de commissariat aux apports · Exercice ${selectedYear}`;

  return (
    <div className="space-y-4">
      <PageHeader title="CAA · Commissaire aux Apports" description={description} />
      <CaaTable
        rows={rows}
        mode={isBaseView ? "base" : "year"}
        selectedYear={selectedYear}
        center={center}
        years={AVAILABLE_YEARS}
        statusOptions={options}
      />
    </div>
  );
}
