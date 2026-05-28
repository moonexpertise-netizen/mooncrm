import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import IrTable, { type IrObligationCell, type IrRow, type IrStatusOption } from "./ir-table";

export const dynamic = "force-dynamic";

// Annees disponibles : de 2020 (plancher historique pour couvrir IR/IFI
// anterieures) jusqu'a l'annee courante + 2 (planning d'avance).
// S'etend automatiquement avec le temps. Si besoin de descendre plus bas,
// modifier FLOOR_YEAR.
const CURRENT_YEAR = new Date().getFullYear();
const FLOOR_YEAR = 2020;
const AVAILABLE_YEARS = Array.from(
  { length: CURRENT_YEAR + 2 - FLOOR_YEAR + 1 },
  (_, i) => FLOOR_YEAR + i
);

/**
 * Page Mission IR. Deux vues :
 *   - Base (defaut) : un overview cross-annee. Pour chaque client on liste
 *     les annees ou il est souscrit a l'IR et a l'IFI (pills cliquables).
 *   - Annee (?year=YYYY) : pour l'annee selectionnee, on affiche le statut
 *     IR et IFI de chaque client (N/A si pas souscrit).
 *
 * Pattern Notion : meme client, plusieurs annees, statut par annee.
 */
export default async function IrPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const isBaseView = sp.view === "base" || (!sp.year && sp.view !== "year");
  const yearParam = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;
  const selectedYear = AVAILABLE_YEARS.includes(yearParam) ? yearParam : CURRENT_YEAR;

  const sb = await createClient();

  // On charge TOUS les obligations IR/IFI quelle que soit la vue, pour
  // permettre d'afficher les pills cross-annee dans la vue Base et de
  // savoir si un client est souscrit a une annee dans la vue Annee.
  // Query defensive : si etat_facturation n'existe pas (migration 0050
  // pas appliquee), on retombe sur une query sans cette colonne.
  type ObRow = {
    client_ir_id: string;
    annee: number;
    type: string;
    statut_logique: string;
    statut_detail: string | null;
    etat_facturation: string | null;
  };
  const [{ data: clients }, obligationsRes, { data: statusOpts }] = await Promise.all([
    sb
      .from("clients_ir")
      .select("id, slug, civilite, prenom, nom, email, telephone, ldm_statut")
      .order("nom", { ascending: true }),
    sb
      .from("ir_obligations")
      .select("client_ir_id, annee, type, statut_logique, statut_detail, etat_facturation"),
    sb
      .from("status_options")
      .select("type_code, libelle, statut_logique, color, ordre")
      .eq("scope", "ir")
      .eq("actif", true)
      .order("ordre"),
  ]);
  let obligations: ObRow[] | null = obligationsRes.data as ObRow[] | null;
  if (obligationsRes.error) {
    const { data: fb } = await sb
      .from("ir_obligations")
      .select("client_ir_id, annee, type, statut_logique, statut_detail");
    obligations = (fb ?? []).map((r) => ({ ...r, etat_facturation: null })) as ObRow[];
  }

  // Index : client_id -> Map<"YYYY|IR"|"YYYY|IFI", cell>
  // + index parallele : client_id -> Map<YYYY, etat_facturation>
  //   (facturation est conceptuellement par annee, partagee entre IR et IFI)
  const obByClient = new Map<string, Map<string, IrObligationCell>>();
  const factByClient = new Map<string, Map<number, string | null>>();
  for (const o of obligations ?? []) {
    if (!obByClient.has(o.client_ir_id)) obByClient.set(o.client_ir_id, new Map());
    obByClient.get(o.client_ir_id)!.set(`${o.annee}|${o.type}`, {
      annee: o.annee,
      type: o.type as "IR" | "IFI",
      libelle: o.statut_detail,
      statut_logique: o.statut_logique as IrStatusOption["statut_logique"],
    });
    // Premier passe : on prend la valeur etat_facturation rencontree
    // (les rows IR et IFI sont supposees synchronisees par setIrFacturation)
    if (!factByClient.has(o.client_ir_id)) factByClient.set(o.client_ir_id, new Map());
    const fm = factByClient.get(o.client_ir_id)!;
    if (!fm.has(o.annee) || o.etat_facturation) {
      fm.set(o.annee, o.etat_facturation ?? null);
    }
  }

  const rows: IrRow[] = (clients ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    civilite: c.civilite,
    prenom: c.prenom,
    nom: c.nom,
    email: c.email,
    telephone: c.telephone,
    ldm_statut: c.ldm_statut,
    obligations: obByClient.get(c.id) ?? new Map(),
    facturations: factByClient.get(c.id) ?? new Map(),
  }));

  const optsByType: Record<string, IrStatusOption[]> = {};
  for (const o of statusOpts ?? []) {
    if (!optsByType[o.type_code]) optsByType[o.type_code] = [];
    optsByType[o.type_code].push({
      libelle: o.libelle,
      statut_logique: o.statut_logique as IrStatusOption["statut_logique"],
      color: o.color ?? null,
    });
  }

  const description = isBaseView
    ? "Suivi des declarations IR et IFI · Vue d'ensemble"
    : `Suivi des declarations IR et IFI · Exercice ${selectedYear}`;

  return (
    <div className="space-y-4">
      <PageHeader title="IR · Impôts sur le Revenu" description={description} />
      <IrTable
        rows={rows}
        mode={isBaseView ? "base" : "year"}
        selectedYear={selectedYear}
        years={AVAILABLE_YEARS}
        statusOptions={optsByType}
      />
    </div>
  );
}
