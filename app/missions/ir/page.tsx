import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import IrTable, { type IrObligationCell, type IrRow, type IrStatusOption } from "./ir-table";

export const dynamic = "force-dynamic";

// Selecteur d'annee : fenetre glissante de 3 ans centree sur "center".
// Si pas de year/center dans l'URL, par defaut center = annee courante.
// Click sur une annee -> elle devient le nouveau center (la fenetre se decale).
// Click < ou > -> decale la fenetre d'une annee.
const CURRENT_YEAR = new Date().getFullYear();

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
  searchParams: Promise<{ year?: string; view?: string; center?: string }>;
}) {
  const sp = await searchParams;
  const isBaseView = sp.view === "base" || (!sp.year && sp.view !== "year");
  const yearParam = sp.year ? parseInt(sp.year, 10) : null;
  const centerParam = sp.center ? parseInt(sp.center, 10) : null;
  // Center de la fenetre 3-ans : year en priorite, sinon center, sinon CURRENT_YEAR
  const center = (yearParam && !Number.isNaN(yearParam))
    ? yearParam
    : (centerParam && !Number.isNaN(centerParam))
      ? centerParam
      : CURRENT_YEAR;
  const selectedYear = yearParam && !Number.isNaN(yearParam) ? yearParam : center;
  // Fenetre glissante de 3 annees pour la nav haut (selecteur focus) :
  //   [center-1, center, center+1]
  // Fenetre elargie a 6 annees pour les pills de souscription en vue Base
  // (plus de visibilite cross-annee, affichage sur 2 lignes compactes) :
  //   [center-2, center-1, center, center+1, center+2, center+3]
  const AVAILABLE_YEARS = [center - 1, center, center + 1];
  const PILL_YEARS = [center - 2, center - 1, center, center + 1, center + 2, center + 3];

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
    forfait: number | null;
  };
  const [{ data: clients }, obligationsRes, { data: statusOpts }] = await Promise.all([
    sb
      .from("clients_ir")
      .select("id, slug, civilite, prenom, nom, email, telephone, ldm_statut")
      .order("nom", { ascending: true }),
    // Vue 6 annees centree sur current (3 avant, current, 2 apres). On filtre
    // cote DB pour eviter de tirer ~10 ans d'historique a chaque load.
    sb
      .from("ir_obligations")
      .select("client_ir_id, annee, type, statut_logique, statut_detail, etat_facturation, forfait")
      .gte("annee", new Date().getFullYear() - 3)
      .lte("annee", new Date().getFullYear() + 2),
    sb
      .from("status_options")
      .select("type_code, libelle, statut_logique, color, ordre")
      .eq("scope", "ir")
      .eq("actif", true)
      .order("ordre"),
  ]);
  let obligations: ObRow[] | null = obligationsRes.data as ObRow[] | null;
  if (obligationsRes.error) {
    // Fallback : si forfait absent (migration 0053 pas appliquee), retente sans forfait.
    // Si etat_facturation absent aussi (migration 0050), 2e fallback.
    const r1 = await sb
      .from("ir_obligations")
      .select("client_ir_id, annee, type, statut_logique, statut_detail, etat_facturation");
    if (r1.error) {
      const { data: fb } = await sb
        .from("ir_obligations")
        .select("client_ir_id, annee, type, statut_logique, statut_detail");
      obligations = (fb ?? []).map((r) => ({ ...r, etat_facturation: null, forfait: null })) as ObRow[];
    } else {
      obligations = (r1.data ?? []).map((r) => ({ ...r, forfait: null })) as ObRow[];
    }
  }

  // Index : client_id -> Map<"YYYY|IR"|"YYYY|IFI", cell>
  // + index parallele : client_id -> Map<YYYY, etat_facturation>
  //   (facturation est conceptuellement par annee, partagee entre IR et IFI)
  // + index parallele : client_id -> Map<YYYY, forfait>
  //   (meme principe : forfait commun IR+IFI par dossier-annee)
  const obByClient = new Map<string, Map<string, IrObligationCell>>();
  const factByClient = new Map<string, Map<number, string | null>>();
  const forfByClient = new Map<string, Map<number, number | null>>();
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
    // Idem pour le forfait : premier non-null gagne (les rows IR/IFI sont
    // synchronisees par setIrForfait)
    if (!forfByClient.has(o.client_ir_id)) forfByClient.set(o.client_ir_id, new Map());
    const fmF = forfByClient.get(o.client_ir_id)!;
    if (!fmF.has(o.annee) || o.forfait !== null) {
      fmF.set(o.annee, o.forfait ?? null);
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
    forfaits: forfByClient.get(c.id) ?? new Map(),
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
    ? "Suivi des declarations IR et IFI, vue d'ensemble"
    : `Suivi des declarations IR et IFI, exercice ${selectedYear}`;

  return (
    <div className="space-y-5">
      <PageHeader title="IR + IFI, impôts sur le revenu et la fortune" description={description} />
      <IrTable
        rows={rows}
        mode={isBaseView ? "base" : "year"}
        selectedYear={selectedYear}
        center={center}
        years={AVAILABLE_YEARS}
        pillYears={PILL_YEARS}
        statusOptions={optsByType}
      />
    </div>
  );
}
