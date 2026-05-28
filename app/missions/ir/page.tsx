import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import IrTable, { type IrRow, type IrStatusOption } from "./ir-table";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;
const AVAILABLE_YEARS = [2024, 2025, 2026, 2027];

/**
 * Page Mission IR : liste des personnes physiques pour lesquelles MOON
 * gere les declarations IR / IFI annuelles.
 *
 * Structure : 1 ligne par personne, 2 cellules statut par annee (IR + IFI),
 * 1 cellule statut LDM. Editable inline.
 */
export default async function IrPage({
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
      .from("clients_ir")
      .select("id, slug, civilite, prenom, nom, email, telephone, ldm_statut")
      .order("nom", { ascending: true }),
    sb
      .from("ir_obligations")
      .select("client_ir_id, annee, type, statut_logique, statut_detail")
      .eq("annee", selectedYear),
    sb
      .from("status_options")
      .select("type_code, libelle, statut_logique, color, ordre")
      .eq("scope", "ir")
      .eq("actif", true)
      .order("ordre"),
  ]);

  // Index obligations par client_ir_id et type
  const obligationsByClient = new Map<
    string,
    { ir: { libelle: string | null; statut_logique: string } | null; ifi: { libelle: string | null; statut_logique: string } | null }
  >();
  for (const o of obligations ?? []) {
    const slot = obligationsByClient.get(o.client_ir_id) ?? { ir: null, ifi: null };
    if (o.type === "IR") slot.ir = { libelle: o.statut_detail, statut_logique: o.statut_logique };
    else if (o.type === "IFI") slot.ifi = { libelle: o.statut_detail, statut_logique: o.statut_logique };
    obligationsByClient.set(o.client_ir_id, slot);
  }

  const rows: IrRow[] = (clients ?? []).map((c) => {
    const ob = obligationsByClient.get(c.id) ?? { ir: null, ifi: null };
    return {
      id: c.id,
      slug: c.slug,
      civilite: c.civilite,
      prenom: c.prenom,
      nom: c.nom,
      email: c.email,
      telephone: c.telephone,
      ldm_statut: c.ldm_statut,
      ir: ob.ir,
      ifi: ob.ifi,
    };
  });

  // Status options : on les transmet par type_code (IR_ANNEE, IFI_ANNEE)
  const optsByType: Record<string, IrStatusOption[]> = {};
  for (const o of statusOpts ?? []) {
    if (!optsByType[o.type_code]) optsByType[o.type_code] = [];
    optsByType[o.type_code].push({
      libelle: o.libelle,
      statut_logique: o.statut_logique as IrStatusOption["statut_logique"],
      color: o.color ?? null,
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="IR · Impôts sur le Revenu"
        description={`Suivi des déclarations IR et IFI · Exercice ${selectedYear}`}
      />
      <IrTable
        rows={rows}
        annee={selectedYear}
        years={AVAILABLE_YEARS}
        statusOptions={optsByType}
      />
    </div>
  );
}
