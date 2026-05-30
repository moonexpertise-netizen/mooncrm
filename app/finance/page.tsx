import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import FinanceDashboard, {
  type FinanceData,
  type MonthCell,
  type ProjectionContrib,
  type WaterfallStage,
  type WhatIfData,
  type SurveilItem,
} from "./finance-dashboard";

export const dynamic = "force-dynamic";

/**
 * Dashboard /finance v2 - prospectif et actionnable.
 *
 * Differencie nettement du dashboard / (qui est l'etat present : MRR, top
 * clients, signatures par mois, risque production). Ici on regarde le FUTUR
 * et les LEVIERS :
 *
 *   1. Projection cash 12 mois (barres empilees + drawer detail par mois)
 *   2. Waterfall pipeline (ARR brut -> pondere par stade)
 *   3. What-if / sensibilite (scenarios actionnables)
 *   4. A surveiller (deals qui stagnent + missions a encaisser)
 */

// ============================================================================
// Constantes metier
// ============================================================================

/**
 * Pour chaque stade pipeline, on a :
 *   - ponderation : probabilite de signature
 *   - delaiJours : nb de jours apres aujourd'hui ou on suppose que le prospect
 *     va signer. Heuristique : plus le stade est avance, plus c'est proche.
 *     Permet d'etaler le pondere sur les mois a venir au lieu de tout
 *     mettre sur M+0.
 */
const STADE_DEF: Record<
  string,
  { ponderation: number; delaiJours: number; label: string }
> = {
  "1": { ponderation: 0.05, delaiJours: 120, label: "1 - Tally à envoyer" },
  "2": { ponderation: 0.15, delaiJours: 90, label: "2 - Tally à compléter" },
  "3": { ponderation: 0.30, delaiJours: 60, label: "3 - PC à préparer" },
  "4": { ponderation: 0.50, delaiJours: 45, label: "4 - PC envoyée" },
  "5": { ponderation: 0.75, delaiJours: 15, label: "5 - PC acceptée" },
  "6": { ponderation: 0.90, delaiJours: 7, label: "6 - LDM envoyée" },
};

const SURVEIL_THRESHOLDS = {
  stade6_jours: 30, // LDM envoyee sans bouger
  stade4_jours: 21, // PC envoyee sans bouger
  mex_livree_jours: 30, // livree non facturee
};

function stadePrefix(pipeline: string | null): string | null {
  if (!pipeline) return null;
  const m = pipeline.match(/^(\d|Z)\s?-/);
  return m ? m[1] : null;
}

type ClientRaw = {
  id: string;
  slug: string;
  denomination: string;
  pipeline_statut: string | null;
  pipeline_changed_at: string | null;
  honoraires_compta: number | null;
  forfait_bilan: number | null;
  honoraires_jur: number | null;
  honoraires_creation: number | null;
  honoraires_reprise: number | null;
  tdb_honos_periode: number | null;
  tdb_periode: string | null;
  type_honos_bilans: string | null;
  type_honos_jur: string | null;
  type_honos_creation: string | null;
  type_honos_reprise: string | null;
};

function clientMrr(c: ClientRaw): number {
  let mrr = 0;
  mrr += c.honoraires_compta ?? 0;
  if (c.tdb_periode === "Mensuel") mrr += c.tdb_honos_periode ?? 0;
  else if (c.tdb_periode === "Trimestriel") mrr += (c.tdb_honos_periode ?? 0) / 3;
  if (c.type_honos_bilans === "Facturés") mrr += (c.forfait_bilan ?? 0) / 12;
  if (c.type_honos_jur === "Facturés") mrr += (c.honoraires_jur ?? 0) / 12;
  return mrr;
}

function clientOneShot(c: ClientRaw): number {
  return (
    (c.type_honos_creation === "Facturés" ? c.honoraires_creation ?? 0 : 0) +
    (c.type_honos_reprise === "Facturés" ? c.honoraires_reprise ?? 0 : 0)
  );
}

/** Renvoie "YYYY-MM" pour un Date donne. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return d
    .toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
    .replace(".", "");
}

/** Genere une liste de N mois a partir du mois courant. */
function buildMonths(nbMonths: number): Array<{ key: string; label: string; date: Date }> {
  const out: Array<{ key: string; label: string; date: Date }> = [];
  const start = new Date();
  start.setDate(1);
  for (let i = 0; i < nbMonths; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    out.push({ key: monthKey(d), label: monthLabel(d), date: d });
  }
  return out;
}

// ============================================================================
// Page
// ============================================================================

export default async function FinancePage() {
  const sb = await createClient();

  const [
    { data: clientsRaw },
    irRowsRes,
    caaRowsRes,
    agoRowsRes,
    bilanRowsRes,
    { data: missionRows },
  ] = await Promise.all([
    sb.from("clients").select(
      "id, slug, denomination, pipeline_statut, pipeline_changed_at, honoraires_compta, forfait_bilan, honoraires_jur, honoraires_creation, honoraires_reprise, tdb_honos_periode, tdb_periode, type_honos_bilans, type_honos_jur, type_honos_creation, type_honos_reprise"
    ),
    sb
      .from("ir_obligations")
      .select("id, annee, client_ir_id, statut_logique, etat_facturation, forfait, type, clients_ir!inner(id, slug, civilite, prenom, nom)")
      .eq("statut_logique", "TERMINE"),
    sb
      .from("caa_obligations")
      .select("id, annee, client_caa_id, statut_logique, etat_facturation, forfait, clients_caa!inner(id, slug, denomination)")
      .eq("statut_logique", "TERMINE"),
    sb
      .from("obligations")
      .select("id, annee, statut_logique, statut_detail, etat_facturation, clients!inner(id, slug, denomination, honoraires_jur)")
      .eq("type", "AGO_DEPOT"),
    sb
      .from("obligations")
      .select("id, annee, statut_logique, statut_detail, etat_facturation, clients!inner(id, slug, denomination, forfait_bilan, type_honos_bilans)")
      .eq("type", "LIASSE_PLAQUETTE"),
    sb
      .from("missions_exceptionnelles")
      .select("id, slug, mission, etat_mission, etat_facturation, forfait, date_debut, date_fin, client_id, client_libre, clients(slug, denomination)"),
  ]);

  // Fallback defensif sur les forfaits IR/CAA (migration 0053)
  const irRows = irRowsRes.error ? [] : ((irRowsRes.data ?? []) as IrRowDb[]);
  const caaRows = caaRowsRes.error ? [] : ((caaRowsRes.data ?? []) as CaaRowDb[]);

  const clients = (clientsRaw ?? []) as ClientRaw[];
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  const todayMs = now.getTime();

  // ============================================================================
  // 1. PROJECTION CASH 12 mois (M+0 a M+11)
  // ============================================================================
  const PROJECTION_HORIZON = 12;
  const months = buildMonths(PROJECTION_HORIZON);
  const monthsMap = new Map(months.map((m) => [m.key, m]));

  // Pour chaque mois, on stocke 4 categories de montants + les contributeurs.
  type ProjectionMonth = {
    key: string;
    label: string;
    facturable: number; // sur M+0 only : cash mobilisable maintenant
    recurrent: number;  // MRR signe etale chaque mois
    ponctuel: number;   // forfaits ponctuels IR/CAA dus
    pondere: number;    // pondere pipeline non-signe
    contribs: ProjectionContrib[];
  };
  const proj = new Map<string, ProjectionMonth>();
  for (const m of months) {
    proj.set(m.key, {
      key: m.key,
      label: m.label,
      facturable: 0,
      recurrent: 0,
      ponctuel: 0,
      pondere: 0,
      contribs: [],
    });
  }

  // --- A. Cash facturable maintenant : tout sur M+0 ---
  const m0Key = months[0].key;
  const m0 = proj.get(m0Key)!;

  // IR : forfait IR+IFI sync, on divise par 2 (cf doc setIrForfait)
  type IrRowDb = {
    id: string;
    annee: number;
    client_ir_id: string;
    etat_facturation: string | null;
    forfait: number | null;
    type: string;
    clients_ir: { id: string; slug: string; civilite: string | null; prenom: string | null; nom: string } | Array<{ id: string; slug: string; civilite: string | null; prenom: string | null; nom: string }>;
  };
  // Dedup par (client, annee) car IR + IFI partagent le forfait
  const irFacturableByKey = new Map<string, { client: string; slug: string; annee: number; montant: number }>();
  for (const r of irRows as IrRowDb[]) {
    if (r.etat_facturation !== null && r.etat_facturation !== "a_facturer") continue;
    const c = Array.isArray(r.clients_ir) ? r.clients_ir[0] : r.clients_ir;
    if (!c) continue;
    const key = `${c.id}|${r.annee}`;
    if (irFacturableByKey.has(key)) continue;
    const fullName = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ");
    irFacturableByKey.set(key, {
      client: fullName,
      slug: `/missions/ir?year=${r.annee}`,
      annee: r.annee,
      montant: r.forfait ?? 0,
    });
  }
  for (const item of irFacturableByKey.values()) {
    if (item.montant <= 0) continue;
    m0.facturable += item.montant;
    m0.contribs.push({
      source: "IR + IFI",
      label: `${item.client} · ${item.annee}`,
      montant: item.montant,
      href: item.slug,
      bucket: "facturable",
    });
  }

  // CAA
  type CaaRowDb = {
    id: string;
    annee: number;
    client_caa_id: string;
    etat_facturation: string | null;
    forfait: number | null;
    clients_caa: { id: string; slug: string; denomination: string } | Array<{ id: string; slug: string; denomination: string }>;
  };
  for (const r of caaRows as CaaRowDb[]) {
    if (r.etat_facturation !== null && r.etat_facturation !== "a_facturer") continue;
    const c = Array.isArray(r.clients_caa) ? r.clients_caa[0] : r.clients_caa;
    if (!c) continue;
    const f = r.forfait ?? 0;
    if (f <= 0) continue;
    m0.facturable += f;
    m0.contribs.push({
      source: "CAA",
      label: `${c.denomination} · ${r.annee}`,
      montant: f,
      href: `/missions/caa?year=${r.annee}`,
      bucket: "facturable",
    });
  }

  // AGO billable (honoraires_jur du client)
  type AgoRowDb = {
    id: string;
    annee: number;
    statut_logique: string;
    statut_detail: string | null;
    etat_facturation: string | null;
    clients: { id: string; slug: string; denomination: string; honoraires_jur: number | null } | Array<{ id: string; slug: string; denomination: string; honoraires_jur: number | null }>;
  };
  function isAgoBillable(detail: string | null, logique: string | null): boolean {
    if (logique === "TERMINE") return true;
    if (!detail) return false;
    const n = detail.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return n.includes("depose") || n.includes("valide");
  }
  for (const r of (agoRowsRes.data ?? []) as AgoRowDb[]) {
    if (!isAgoBillable(r.statut_detail, r.statut_logique)) continue;
    if (r.etat_facturation !== null && r.etat_facturation !== "a_facturer") continue;
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const f = c?.honoraires_jur ?? 0;
    if (f <= 0) continue;
    m0.facturable += f;
    m0.contribs.push({
      source: "AGO",
      label: `${c?.denomination ?? "?"} · ${r.annee}`,
      montant: f,
      href: `/obligations/ago-depot?year=${r.annee}`,
      bucket: "facturable",
    });
  }

  // Bilan billable (forfait_bilan client si type_honos_bilans = Facturés)
  type BilanRowDb = {
    id: string;
    annee: number;
    statut_logique: string;
    statut_detail: string | null;
    etat_facturation: string | null;
    clients: { id: string; slug: string; denomination: string; forfait_bilan: number | null; type_honos_bilans: string | null } | Array<{ id: string; slug: string; denomination: string; forfait_bilan: number | null; type_honos_bilans: string | null }>;
  };
  function isBilanBillable(detail: string | null, logique: string | null): boolean {
    if (logique === "TERMINE") return true;
    if (!detail) return false;
    const n = detail.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return n.includes("plaquette transmise") || n.includes("plaquette transmis");
  }
  for (const r of (bilanRowsRes.data ?? []) as BilanRowDb[]) {
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    if (c?.type_honos_bilans !== "Facturés") continue;
    if (!isBilanBillable(r.statut_detail, r.statut_logique)) continue;
    if (r.etat_facturation !== null && r.etat_facturation !== "a_facturer") continue;
    const f = c?.forfait_bilan ?? 0;
    if (f <= 0) continue;
    m0.facturable += f;
    m0.contribs.push({
      source: "Bilan",
      label: `${c?.denomination ?? "?"} · ${r.annee}`,
      montant: f,
      href: `/obligations/liasses-plaquettes?year=${r.annee}`,
      bucket: "facturable",
    });
  }

  // Missions exc livrees a facturer
  type MexRowDb = {
    id: string;
    slug: string;
    mission: string;
    etat_mission: string;
    etat_facturation: string | null;
    forfait: number | null;
    date_debut: string | null;
    date_fin: string | null;
    client_id: string | null;
    client_libre: string | null;
    clients: { slug: string; denomination: string } | Array<{ slug: string; denomination: string }> | null;
  };
  const missions = (missionRows ?? []) as MexRowDb[];
  for (const m of missions) {
    if (m.etat_mission !== "livree") continue;
    if (m.etat_facturation !== null && m.etat_facturation !== "a_facturer") continue;
    const f = m.forfait ?? 0;
    if (f <= 0) continue;
    const cc = Array.isArray(m.clients) ? m.clients[0] : m.clients;
    const name = cc?.denomination ?? m.client_libre ?? "?";
    m0.facturable += f;
    m0.contribs.push({
      source: "Mission exc.",
      label: `${name} · ${m.mission}`,
      montant: f,
      href: "/missions/exceptionnelles",
      bucket: "facturable",
    });
  }

  // --- B. Recurrent signe : MRR etale sur 12 mois ---
  const signes = clients.filter((c) => stadePrefix(c.pipeline_statut) === "7");
  for (const c of signes) {
    const mrr = clientMrr(c);
    if (mrr <= 0) continue;
    for (let i = 0; i < PROJECTION_HORIZON; i++) {
      const m = proj.get(months[i].key)!;
      m.recurrent += mrr;
      // On ajoute le contrib seulement sur le mois courant + le mois prochain
      // pour eviter d'avoir 12 contribs par client signe (trop verbeux dans le
      // drawer). Le user verra la liste complete via la fiche client.
      if (i <= 1) {
        m.contribs.push({
          source: "Récurrent",
          label: c.denomination,
          montant: mrr,
          href: `/clients/${c.slug}`,
          bucket: "recurrent",
        });
      }
    }
  }

  // --- C. Ponctuel signe : forfaits IR/CAA des annees en cours ---
  // Pour chaque forfait IR/CAA non encore facture mais sur une annee courante
  // ou future, on le place sur le mois ou l'annee est susceptible d'etre cloturee.
  // Approximation : le bilan/IR/CAA est typiquement facture en mai-juin pour
  // l'exercice clos en decembre. On place donc forfait IR/CAA d'annee N sur
  // M correspondant a "juin N+1" si on a depasse, sinon sur fin d'annee N.
  //
  // Note V2 : le ponctuel non encore TERMINE n'apparait pas dans la projection
  // (approche conservatrice : on projette uniquement ce qui est deja facturable,
  // du recurrent signe, ou du pondere pipeline). Les forfaits IR/CAA d'annees
  // en cours apparaitront quand le tracker passera en TERMINE, ils tomberont
  // alors dans le bucket "facturable" sur M+0.

  // --- D. Pondere pipeline : prospects non-signes etales selon heuristique ---
  const enCours = clients.filter((c) => {
    const s = stadePrefix(c.pipeline_statut);
    return s !== null && s !== "Z" && s !== "7";
  });
  for (const c of enCours) {
    const s = stadePrefix(c.pipeline_statut);
    if (!s || !STADE_DEF[s]) continue;
    const def = STADE_DEF[s];
    const mrr = clientMrr(c);
    if (mrr <= 0) continue;

    // Date prévisionnelle de signature
    const signatureDate = new Date(now);
    signatureDate.setDate(signatureDate.getDate() + def.delaiJours);

    // Pour chaque mois >= signatureDate, on ajoute mrr * ponderation
    let added = false;
    for (const m of months) {
      if (m.date < new Date(signatureDate.getFullYear(), signatureDate.getMonth(), 1)) continue;
      const pm = proj.get(m.key)!;
      const amount = mrr * def.ponderation;
      pm.pondere += amount;
      if (!added) {
        // Une seule contrib par prospect (au mois de premiere apparition)
        pm.contribs.push({
          source: `Pipeline ${def.label}`,
          label: `${c.denomination} · ${(def.ponderation * 100).toFixed(0)} %`,
          montant: amount,
          href: `/clients/${c.slug}`,
          bucket: "pondere",
        });
        added = true;
      }
    }
  }

  const monthly: MonthCell[] = months.map((m) => {
    const p = proj.get(m.key)!;
    return {
      key: m.key,
      label: m.label,
      facturable: Math.round(p.facturable),
      recurrent: Math.round(p.recurrent),
      ponctuel: Math.round(p.ponctuel),
      pondere: Math.round(p.pondere),
      total: Math.round(p.facturable + p.recurrent + p.ponctuel + p.pondere),
      contribs: p.contribs.sort((a, b) => b.montant - a.montant),
    };
  });

  // ============================================================================
  // 2. WATERFALL PIPELINE
  // ============================================================================
  // Pour chaque stade, on liste les prospects + leurs ARR (brut + pondere).
  const waterfallByStage = new Map<string, { count: number; arrBrut: number; arrPondere: number; oneShot: number; clients: { id: string; slug: string; denomination: string; arrBrut: number; arrPondere: number }[] }>();
  for (const s of Object.keys(STADE_DEF)) {
    waterfallByStage.set(s, { count: 0, arrBrut: 0, arrPondere: 0, oneShot: 0, clients: [] });
  }
  for (const c of enCours) {
    const s = stadePrefix(c.pipeline_statut);
    if (!s || !STADE_DEF[s]) continue;
    const def = STADE_DEF[s];
    const mrr = clientMrr(c);
    const arrBrut = mrr * 12;
    const oneShot = clientOneShot(c);
    const totalBrut = arrBrut + oneShot;
    if (totalBrut <= 0) continue;
    const arrPondere = totalBrut * def.ponderation;
    const agg = waterfallByStage.get(s)!;
    agg.count++;
    agg.arrBrut += totalBrut;
    agg.arrPondere += arrPondere;
    agg.oneShot += oneShot;
    agg.clients.push({
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      arrBrut: totalBrut,
      arrPondere,
    });
  }
  const waterfall: WaterfallStage[] = Object.entries(STADE_DEF).map(([s, def]) => {
    const agg = waterfallByStage.get(s)!;
    agg.clients.sort((a, b) => b.arrBrut - a.arrBrut);
    return {
      stade: def.label,
      ponderation: def.ponderation,
      count: agg.count,
      arrBrut: Math.round(agg.arrBrut),
      arrPondere: Math.round(agg.arrPondere),
      clients: agg.clients.map((cl) => ({
        id: cl.id,
        slug: cl.slug,
        denomination: cl.denomination,
        arrBrut: Math.round(cl.arrBrut),
        arrPondere: Math.round(cl.arrPondere),
      })),
    };
  });
  const totalArrBrut = waterfall.reduce((s, w) => s + w.arrBrut, 0);
  const totalArrPondere = waterfall.reduce((s, w) => s + w.arrPondere, 0);

  // ============================================================================
  // 3. WHAT-IF / SENSIBILITE
  // ============================================================================
  const arrSigne = signes.reduce((s, c) => s + clientMrr(c) * 12, 0);
  const arrMoyenSigne = signes.length > 0 ? arrSigne / signes.length : 0;

  // Top clients : pour concentration risque
  const topClients = signes
    .map((c) => ({ id: c.id, slug: c.slug, denomination: c.denomination, arr: clientMrr(c) * 12 }))
    .sort((a, b) => b.arr - a.arr);
  const top1Arr = topClients.length >= 1 ? topClients[0].arr : 0;
  const top3Arr = topClients.slice(0, 3).reduce((s, c) => s + c.arr, 0);
  const top5Arr = topClients.slice(0, 5).reduce((s, c) => s + c.arr, 0);

  // Scenario "convertir tout le stade 5"
  const stade5 = waterfall.find((w) => w.stade.startsWith("5 -"))!;
  const stade6 = waterfall.find((w) => w.stade.startsWith("6 -"))!;

  // Cash mobilisable total = M+0.facturable
  const cashMobilisable = m0.facturable;

  // Pour atteindre +25 % ARR : combien de signatures supplementaires ?
  const targetArrGrowth = arrSigne * 0.25;
  const nbSignaturesNeeded = arrMoyenSigne > 0 ? Math.ceil(targetArrGrowth / arrMoyenSigne) : 0;

  const whatIf: WhatIfData = {
    arrSigne: Math.round(arrSigne),
    arrMoyenSigne: Math.round(arrMoyenSigne),
    nbSignes: signes.length,
    cashMobilisable: Math.round(cashMobilisable),
    cashMobilisableCount: m0.contribs.filter((c) => c.bucket === "facturable").length,
    stade5: {
      count: stade5.count,
      arrBrut: stade5.arrBrut,
      arrPondere: stade5.arrPondere,
      clients: stade5.clients,
    },
    stade6: {
      count: stade6.count,
      arrBrut: stade6.arrBrut,
      arrPondere: stade6.arrPondere,
      clients: stade6.clients,
    },
    top1Arr: Math.round(top1Arr),
    top3Arr: Math.round(top3Arr),
    top5Arr: Math.round(top5Arr),
    top1Pct: arrSigne > 0 ? (top1Arr / arrSigne) * 100 : 0,
    top3Pct: arrSigne > 0 ? (top3Arr / arrSigne) * 100 : 0,
    top5Pct: arrSigne > 0 ? (top5Arr / arrSigne) * 100 : 0,
    targetArrGrowth: Math.round(targetArrGrowth),
    nbSignaturesNeeded,
    targetMoisGrowth: 12, // par defaut sur 1 an
  };

  // ============================================================================
  // 4. A SURVEILLER
  // ============================================================================
  const surveil: SurveilItem[] = [];

  // Prospects stade 6 qui stagnent
  for (const c of clients) {
    const s = stadePrefix(c.pipeline_statut);
    if (s !== "6") continue;
    if (!c.pipeline_changed_at) continue;
    const changedMs = new Date(c.pipeline_changed_at).getTime();
    const ageDays = Math.floor((todayMs - changedMs) / (1000 * 60 * 60 * 24));
    if (ageDays < SURVEIL_THRESHOLDS.stade6_jours) continue;
    const mrr = clientMrr(c);
    surveil.push({
      type: "stade_6_stagne",
      severity: ageDays > 60 ? "high" : "medium",
      title: c.denomination,
      detail: `LDM envoyée depuis ${ageDays} j · ARR potentiel ${Math.round(mrr * 12)} € HT`,
      ageDays,
      montant: Math.round(mrr * 12 * STADE_DEF["6"].ponderation),
      href: `/clients/${c.slug}`,
    });
  }

  // Prospects stade 4 qui stagnent
  for (const c of clients) {
    const s = stadePrefix(c.pipeline_statut);
    if (s !== "4") continue;
    if (!c.pipeline_changed_at) continue;
    const changedMs = new Date(c.pipeline_changed_at).getTime();
    const ageDays = Math.floor((todayMs - changedMs) / (1000 * 60 * 60 * 24));
    if (ageDays < SURVEIL_THRESHOLDS.stade4_jours) continue;
    const mrr = clientMrr(c);
    surveil.push({
      type: "stade_4_stagne",
      severity: ageDays > 45 ? "high" : "medium",
      title: c.denomination,
      detail: `PC envoyée depuis ${ageDays} j · ARR potentiel ${Math.round(mrr * 12)} € HT`,
      ageDays,
      montant: Math.round(mrr * 12 * STADE_DEF["4"].ponderation),
      href: `/clients/${c.slug}`,
    });
  }

  // Missions exc livrees non facturees depuis > 30j
  for (const m of missions) {
    if (m.etat_mission !== "livree") continue;
    if (m.etat_facturation === "facturee" || m.etat_facturation === "sans_facture") continue;
    if (!m.date_fin) continue;
    const finMs = new Date(m.date_fin).getTime();
    const ageDays = Math.floor((todayMs - finMs) / (1000 * 60 * 60 * 24));
    if (ageDays < SURVEIL_THRESHOLDS.mex_livree_jours) continue;
    const cc = Array.isArray(m.clients) ? m.clients[0] : m.clients;
    const name = cc?.denomination ?? m.client_libre ?? "?";
    surveil.push({
      type: "mex_non_facturee",
      severity: ageDays > 60 ? "high" : "medium",
      title: `${name} · ${m.mission}`,
      detail: `Livrée le ${m.date_fin} (${ageDays} j) · ${(m.forfait ?? 0).toLocaleString("fr-FR")} € HT à facturer`,
      ageDays,
      montant: m.forfait ?? 0,
      href: "/missions/exceptionnelles",
    });
  }

  // Tri : high > medium, puis par age decroissant
  surveil.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return b.ageDays - a.ageDays;
  });

  const data: FinanceData = {
    monthly,
    waterfall,
    totalArrBrut,
    totalArrPondere,
    whatIf,
    surveil,
  };

  void today;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance · Projection & leviers"
        description="Cash à venir, pipeline pondéré, scénarios what-if · à 12 mois"
      />
      <FinanceDashboard data={data} />
    </div>
  );
}

// Types DB partiels (typage du retour Supabase)
type IrRowDb = {
  id: string;
  annee: number;
  client_ir_id: string;
  etat_facturation: string | null;
  forfait: number | null;
  type: string;
  statut_logique: string;
  clients_ir: unknown;
};
type CaaRowDb = {
  id: string;
  annee: number;
  client_caa_id: string;
  etat_facturation: string | null;
  forfait: number | null;
  statut_logique: string;
  clients_caa: unknown;
};
