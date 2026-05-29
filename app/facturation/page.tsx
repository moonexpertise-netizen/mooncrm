import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import FacturationCenter, {
  type FactItem,
  type FactSource,
} from "./facturation-center";

export const dynamic = "force-dynamic";

/**
 * Page Facturation centralisee : agrege toutes les factures a emettre
 * provenant des differents modules :
 *   - CAA  : missions cloturees (statut_logique = TERMINE)
 *   - IR   : declarations terminees (statut_logique = TERMINE)
 *   - AGO  : depots dont le statut est TERMINE (=> "2 - Depose" ou apres)
 *   - Bilan : LIASSE_PLAQUETTE en "4 - Plaquette transmise" (TERMINE)
 *            ET clients avec type_honos_bilans = 'Facturés'
 *   - Mission exc : etat_mission = "livree"
 *
 * On filtre pour ne PAS afficher les items deja en "sans_facture" sauf si
 * l'utilisateur l'a choisi (sinon ils polluent la liste).
 */
export default async function FacturationPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string; source?: string }>;
}) {
  const sp = await searchParams;
  // Default = "a_facturer" pour coller au comportement UI (qui affiche le tab
  // "À facturer" actif par defaut). Avant : sp.etat undefined -> aucun filtre
  // applique -> les items deja factures apparaissaient dans le tab "À facturer".
  const filterEtat: FactItem["etat_facturation"] | "all" =
    (sp.etat as FactItem["etat_facturation"] | "all" | undefined) ?? "a_facturer";
  const filterSource: FactSource | "all" =
    (sp.source as FactSource | "all" | undefined) ?? "all";

  const sb = await createClient();

  // ============================================================================
  // 1. CAA terminees
  // ============================================================================
  const { data: caaRows } = await sb
    .from("caa_obligations")
    .select(
      "id, annee, statut_logique, statut_detail, etat_facturation, clients_caa!inner(id, slug, denomination)"
    )
    .eq("statut_logique", "TERMINE");

  type CaaRow = {
    id: string;
    annee: number;
    statut_logique: string;
    statut_detail: string | null;
    etat_facturation: string | null;
    clients_caa: { id: string; slug: string; denomination: string } | Array<{ id: string; slug: string; denomination: string }>;
  };
  const caaItems: FactItem[] = ((caaRows ?? []) as unknown as CaaRow[]).map((r) => {
    const c = Array.isArray(r.clients_caa) ? r.clients_caa[0] : r.clients_caa;
    return {
      key: `caa-${r.id}`,
      source: "caa",
      rowId: r.id,
      clientName: c?.denomination ?? "?",
      clientHref: c?.slug ? `/missions/caa?year=${r.annee}` : null,
      detail: `CAA ${r.annee}`,
      sousDetail: r.statut_detail,
      montant: null,
      etat_facturation: (r.etat_facturation ?? null) as FactItem["etat_facturation"],
    };
  });

  // ============================================================================
  // 2. IR terminees - on aggrege IR + IFI sur (client, annee) pour eviter
  //    les doublons (1 facturation par dossier-annee, pas par type)
  // ============================================================================
  const { data: irRows } = await sb
    .from("ir_obligations")
    .select(
      "id, annee, type, statut_logique, statut_detail, etat_facturation, clients_ir!inner(id, slug, civilite, prenom, nom)"
    )
    .eq("statut_logique", "TERMINE");

  type IrRow = {
    id: string;
    annee: number;
    type: string;
    statut_logique: string;
    statut_detail: string | null;
    etat_facturation: string | null;
    clients_ir: { id: string; slug: string; civilite: string | null; prenom: string | null; nom: string } | Array<{ id: string; slug: string; civilite: string | null; prenom: string | null; nom: string }>;
  };
  const irByKey = new Map<string, FactItem>();
  for (const r of (irRows ?? []) as unknown as IrRow[]) {
    const c = Array.isArray(r.clients_ir) ? r.clients_ir[0] : r.clients_ir;
    if (!c) continue;
    const key = `${c.id}|${r.annee}`;
    const fullName = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ");
    // Plusieurs types peuvent exister (IR + IFI) ; on garde un seul item par client/annee
    const existing = irByKey.get(key);
    const types: string[] = existing?.detail.match(/IR|IFI/g) ?? [];
    if (!types.includes(r.type)) types.push(r.type);
    irByKey.set(key, {
      key: `ir-${key}`,
      source: "ir",
      rowId: key, // "clientId|annee" : setFacturationFromCentral synchronise IR+IFI
      clientName: fullName,
      clientHref: `/missions/ir?year=${r.annee}`,
      detail: `${types.sort().join(" + ")} ${r.annee}`,
      sousDetail: existing?.sousDetail ?? r.statut_detail,
      montant: null,
      etat_facturation: (r.etat_facturation ?? existing?.etat_facturation ?? null) as FactItem["etat_facturation"],
    });
  }
  const irItems = [...irByKey.values()];

  // ============================================================================
  // 3. AGO billables : on recupere TOUS les AGO_DEPOT puis on filtre cote JS.
  //    Avantages :
  //      - Independant de la migration 0051 (statut_logique TERMINE ou EN_COURS)
  //      - Robuste vs variantes d'encodage UTF-8 du libelle ("Déposé" peut
  //        avoir 1 ou 2 codepoints selon normalisation NFC/NFD)
  //      - Match permissif : tout statut contenant "depose" ou "valide" (case
  //        et accent insensitive)
  // ============================================================================
  const { data: agoAll, error: agoErr } = await sb
    .from("obligations")
    .select(
      "id, annee, statut_logique, statut_detail, etat_facturation, clients!inner(id, slug, denomination, honoraires_jur)"
    )
    .eq("type", "AGO_DEPOT");
  if (agoErr) {
    // eslint-disable-next-line no-console
    console.error("[/facturation] AGO query error:", agoErr);
  }
  function isAgoBillable(statut_detail: string | null, statut_logique: string | null): boolean {
    if (statut_logique === "TERMINE") return true;
    if (!statut_detail) return false;
    const norm = statut_detail.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return norm.includes("depose") || norm.includes("valide");
  }
  const agoRows = (agoAll ?? []).filter((r) =>
    isAgoBillable(r.statut_detail, r.statut_logique)
  );

  type AgoRow = {
    id: string;
    annee: number;
    statut_logique: string;
    statut_detail: string | null;
    etat_facturation: string | null;
    clients:
      | { id: string; slug: string; denomination: string; honoraires_jur: number | null }
      | Array<{ id: string; slug: string; denomination: string; honoraires_jur: number | null }>;
  };
  const agoItems: FactItem[] = ((agoRows ?? []) as unknown as AgoRow[]).map((r) => {
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    // Montant AGO = honoraires juridiques du client (couvre AGO + actes juridiques annexes).
    // On considere 0 comme "non saisi" : pas de montant a afficher.
    const hj = c?.honoraires_jur ?? null;
    return {
      key: `ago-${r.id}`,
      source: "ago",
      rowId: r.id,
      clientName: c?.denomination ?? "?",
      clientHref: c?.slug ? `/obligations/ago-depot?year=${r.annee}` : null,
      detail: `AGO ${r.annee}`,
      sousDetail: r.statut_detail,
      montant: hj && hj > 0 ? Math.round(hj) : null,
      etat_facturation: (r.etat_facturation ?? null) as FactItem["etat_facturation"],
    };
  });

  // ============================================================================
  // 4. Bilans : LIASSE_PLAQUETTE en "4 - Plaquette transmise" + client avec
  //    type_honos_bilans = 'Facturés'. Pour les clients ou bilan = inclus
  //    dans le forfait, pas de facturation separee (donc filtrés).
  //    Meme approche que AGO : fetch all + filter JS pour robustesse.
  // ============================================================================
  const { data: bilanAll } = await sb
    .from("obligations")
    .select(
      "id, annee, statut_logique, statut_detail, etat_facturation, clients!inner(id, slug, denomination, forfait_bilan, type_honos_bilans)"
    )
    .eq("type", "LIASSE_PLAQUETTE");
  function isBilanBillable(statut_detail: string | null, statut_logique: string | null): boolean {
    if (statut_logique === "TERMINE") return true;
    if (!statut_detail) return false;
    const norm = statut_detail.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return norm.includes("plaquette transmise") || norm.includes("plaquette transmis");
  }
  const bilanRows = (bilanAll ?? []).filter((r) =>
    isBilanBillable(r.statut_detail, r.statut_logique)
  );

  type BilanRow = {
    id: string;
    annee: number;
    statut_logique: string;
    statut_detail: string | null;
    etat_facturation: string | null;
    clients: {
      id: string;
      slug: string;
      denomination: string;
      forfait_bilan: number | null;
      type_honos_bilans: string | null;
    } | Array<{
      id: string;
      slug: string;
      denomination: string;
      forfait_bilan: number | null;
      type_honos_bilans: string | null;
    }>;
  };
  const bilanItems: FactItem[] = ((bilanRows ?? []) as unknown as BilanRow[])
    .map((r) => {
      const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      return {
        row: r,
        client: c,
      };
    })
    .filter(({ client }) => client?.type_honos_bilans === "Facturés")
    .map(({ row, client }) => ({
      key: `bilan-${row.id}`,
      source: "bilan" as FactSource,
      rowId: row.id,
      clientName: client.denomination,
      clientHref: client.slug ? `/obligations/liasses-plaquettes?year=${row.annee}` : null,
      detail: `Bilan ${row.annee}`,
      sousDetail: row.statut_detail,
      montant: client.forfait_bilan ?? null,
      etat_facturation: (row.etat_facturation ?? null) as FactItem["etat_facturation"],
    }));

  // ============================================================================
  // 5. Missions exceptionnelles livrees
  // ============================================================================
  const { data: missionRows } = await sb
    .from("missions_exceptionnelles")
    .select(
      "id, mission, etat_mission, etat_facturation, forfait, taux_horaire, duree_theorique_h, duree_reelle_h, date_fin, client_id, client_libre, clients(slug, denomination)"
    )
    .eq("etat_mission", "livree");

  type MissionRow = {
    id: string;
    mission: string;
    etat_mission: string;
    etat_facturation: string | null;
    forfait: number | null;
    taux_horaire: number | null;
    duree_theorique_h: number | null;
    duree_reelle_h: number | null;
    date_fin: string | null;
    client_id: string | null;
    client_libre: string | null;
    clients: { slug: string; denomination: string } | Array<{ slug: string; denomination: string }> | null;
  };
  const missionItems: FactItem[] = ((missionRows ?? []) as unknown as MissionRow[]).map((r) => {
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const clientName = c?.denomination ?? r.client_libre ?? "?";
    // Montant : forfait sinon taux*reelle sinon taux*theo
    let montant: number | null = null;
    if (r.forfait !== null) montant = r.forfait;
    else if (r.taux_horaire !== null && r.duree_reelle_h !== null) montant = r.taux_horaire * r.duree_reelle_h;
    else if (r.taux_horaire !== null && r.duree_theorique_h !== null) montant = r.taux_horaire * r.duree_theorique_h;
    return {
      key: `mex-${r.id}`,
      source: "mission_exc",
      rowId: r.id,
      clientName,
      clientHref: "/missions/exceptionnelles",
      detail: r.mission,
      sousDetail: r.date_fin ? `Livrée le ${r.date_fin}` : "Livrée",
      montant: montant ? Math.round(montant) : null,
      etat_facturation: (r.etat_facturation ?? null) as FactItem["etat_facturation"],
    };
  });

  // ============================================================================
  // Concatenation + application des filtres
  // ============================================================================
  const allItems: FactItem[] = [
    ...caaItems,
    ...irItems,
    ...agoItems,
    ...bilanItems,
    ...missionItems,
  ];

  const filtered = allItems.filter((it) => {
    if (filterSource && filterSource !== "all" && it.source !== filterSource) return false;
    if (filterEtat && filterEtat !== "all") {
      // "a_facturer" inclut null (= pas encore decide => par defaut a facturer)
      if (filterEtat === "a_facturer") {
        return it.etat_facturation === null || it.etat_facturation === "a_facturer";
      }
      return it.etat_facturation === filterEtat;
    }
    return true;
  });

  // Trie : a_facturer (et null) en premier, puis facturee, puis sans_facture
  const ORDER: Record<string, number> = {
    a_facturer: 0,
    null: 0,
    facturee: 1,
    sans_facture: 2,
  };
  filtered.sort((a, b) => {
    const oa = ORDER[String(a.etat_facturation)] ?? 99;
    const ob = ORDER[String(b.etat_facturation)] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.clientName.localeCompare(b.clientName, "fr");
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Facturation"
        description="Centralisation des factures à émettre · CAA, IR, AGO, Bilans, Missions exc."
      />
      <FacturationCenter
        items={filtered}
        totalCount={allItems.length}
        filterEtat={filterEtat}
        filterSource={filterSource}
      />
    </div>
  );
}
