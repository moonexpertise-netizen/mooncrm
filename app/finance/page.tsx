import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import { categorieActivite } from "@/lib/activite-categorie";
import FinanceDashboard, { type FinanceData } from "./finance-dashboard";

export const dynamic = "force-dynamic";

/**
 * Cockpit financier MOON Expertise.
 *
 * Vision dirigeant : reel YTD + projection 12 mois + atterrissage 31/12 +
 * scenarios + leviers actionnables. Pas un dashboard plat de KPI.
 *
 * Source du reel : on utilise updated_at des rows avec etat_facturation =
 * 'facturee' comme proxy de la date de facturation (on n'a pas de champ
 * date_facturation dedie - migration future si necessaire).
 */

// ============================================================================
// Heuristique pipeline
// ============================================================================
const STADE_DEF: Record<string, { ponderation: number; delaiJours: number; label: string }> = {
  "1": { ponderation: 0.05, delaiJours: 120, label: "1 - Tally à envoyer" },
  "2": { ponderation: 0.15, delaiJours: 90, label: "2 - Tally à compléter" },
  "3": { ponderation: 0.30, delaiJours: 60, label: "3 - PC à préparer" },
  "4": { ponderation: 0.50, delaiJours: 45, label: "4 - PC envoyée" },
  "5": { ponderation: 0.75, delaiJours: 15, label: "5 - PC acceptée" },
  "6": { ponderation: 0.90, delaiJours: 7, label: "6 - LDM envoyée" },
};

function stadePrefix(p: string | null): string | null {
  if (!p) return null;
  const m = p.match(/^(\d|Z)\s?-/);
  return m ? m[1] : null;
}

// ============================================================================
// Helpers date / mois
// ============================================================================
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }).replace(".", "");
}
function buildMonths(nbBefore: number, nbAfter: number): Array<{ key: string; label: string; date: Date; isFuture: boolean; isCurrent: boolean }> {
  const out: Array<{ key: string; label: string; date: Date; isFuture: boolean; isCurrent: boolean }> = [];
  const now = new Date();
  const currentKey = monthKey(now);
  const start = new Date(now.getFullYear(), now.getMonth() - nbBefore, 1);
  for (let i = 0; i <= nbBefore + nbAfter; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const k = monthKey(d);
    out.push({
      key: k,
      label: monthLabel(d),
      date: d,
      isCurrent: k === currentKey,
      isFuture: d > new Date(now.getFullYear(), now.getMonth(), 1),
    });
  }
  return out;
}

// ============================================================================
// Types DB
// ============================================================================
type ClientRaw = {
  id: string;
  slug: string;
  denomination: string;
  activite: string | null;
  pipeline_statut: string | null;
  pipeline_changed_at: string | null;
  mois_signature: string | null;
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

// ============================================================================
// PAGE
// ============================================================================
export default async function FinancePage() {
  const sb = await createClient();
  const now = new Date();
  const todayMs = now.getTime();
  const currentYear = now.getFullYear();
  const endOfYear = new Date(currentYear, 11, 31);
  const monthsRemaining = 12 - now.getMonth(); // incluant le mois courant

  const [
    { data: clientsRaw },
    irRowsRes,
    caaRowsRes,
    { data: agoRows },
    { data: bilanRows },
    { data: missionRows },
  ] = await Promise.all([
    sb.from("clients").select(
      "id, slug, denomination, activite, pipeline_statut, pipeline_changed_at, mois_signature, honoraires_compta, forfait_bilan, honoraires_jur, honoraires_creation, honoraires_reprise, tdb_honos_periode, tdb_periode, type_honos_bilans, type_honos_jur, type_honos_creation, type_honos_reprise"
    ),
    // Filtres annee : la page Finance affiche au max les ~12 derniers mois
    // + cumul YTD courant. Une fenetre [currentYear-1, currentYear] suffit
    // amplement et evite de tirer 5+ annees d'historique a chaque load.
    sb
      .from("ir_obligations")
      .select("id, annee, client_ir_id, type, statut_logique, statut_detail, etat_facturation, forfait, updated_at, clients_ir!inner(id, slug, civilite, prenom, nom)")
      .gte("annee", currentYear - 1)
      .lte("annee", currentYear),
    sb
      .from("caa_obligations")
      .select("id, annee, client_caa_id, statut_logique, statut_detail, etat_facturation, forfait, updated_at, clients_caa!inner(id, slug, denomination)")
      .gte("annee", currentYear - 1)
      .lte("annee", currentYear),
    sb
      .from("obligations")
      .select("id, annee, type, statut_logique, statut_detail, etat_facturation, updated_at, clients!inner(id, slug, denomination, honoraires_jur)")
      .eq("type", "AGO_DEPOT")
      .gte("annee", currentYear - 1)
      .lte("annee", currentYear),
    sb
      .from("obligations")
      .select("id, annee, type, statut_logique, statut_detail, etat_facturation, updated_at, clients!inner(id, slug, denomination, forfait_bilan, type_honos_bilans)")
      .eq("type", "LIASSE_PLAQUETTE")
      .gte("annee", currentYear - 1)
      .lte("annee", currentYear),
    sb
      .from("missions_exceptionnelles")
      .select("id, slug, mission, etat_mission, etat_facturation, forfait, date_debut, date_fin, updated_at, client_id, client_libre, clients(slug, denomination)"),
  ]);

  const clients = (clientsRaw ?? []) as ClientRaw[];
  const signes = clients.filter((c) => stadePrefix(c.pipeline_statut) === "7");
  const enCours = clients.filter((c) => {
    const s = stadePrefix(c.pipeline_statut);
    return s !== null && s !== "Z" && s !== "7";
  });
  const resilies = clients.filter((c) => c.pipeline_statut === "Z - Résiliée");

  // ============================================================================
  // BLOC 1 : FACTURATIONS REALISEES (proxy updated_at)
  // ============================================================================
  type RealiseItem = {
    key: string;
    monthKey: string; // YYYY-MM
    source: string;
    label: string;
    montant: number;
    href: string;
  };
  const realised: RealiseItem[] = [];

  // IR : dedup par (client, annee) car IR+IFI sync (forfait commun, 2 rows facturee)
  type IrRow = {
    id: string;
    annee: number;
    client_ir_id: string;
    type: string;
    statut_logique: string;
    etat_facturation: string | null;
    forfait: number | null;
    updated_at: string;
    clients_ir: { id: string; slug: string; civilite: string | null; prenom: string | null; nom: string } | Array<{ id: string; slug: string; civilite: string | null; prenom: string | null; nom: string }>;
  };
  const irFacturedKey = new Set<string>();
  for (const r of (irRowsRes.data ?? []) as IrRow[]) {
    if (r.etat_facturation !== "facturee") continue;
    if (!r.forfait || r.forfait <= 0) continue;
    const c = Array.isArray(r.clients_ir) ? r.clients_ir[0] : r.clients_ir;
    if (!c) continue;
    const key = `${c.id}|${r.annee}`;
    if (irFacturedKey.has(key)) continue;
    irFacturedKey.add(key);
    const name = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ");
    realised.push({
      key: `ir-${key}`,
      monthKey: r.updated_at.substring(0, 7),
      source: "IR + IFI",
      label: `${name} · ${r.annee}`,
      montant: r.forfait,
      href: `/missions/ir?year=${r.annee}`,
    });
  }

  // CAA
  type CaaRow = {
    id: string;
    annee: number;
    client_caa_id: string;
    statut_logique: string;
    etat_facturation: string | null;
    forfait: number | null;
    updated_at: string;
    clients_caa: { id: string; slug: string; denomination: string } | Array<{ id: string; slug: string; denomination: string }>;
  };
  for (const r of (caaRowsRes.data ?? []) as CaaRow[]) {
    if (r.etat_facturation !== "facturee") continue;
    if (!r.forfait || r.forfait <= 0) continue;
    const c = Array.isArray(r.clients_caa) ? r.clients_caa[0] : r.clients_caa;
    if (!c) continue;
    realised.push({
      key: `caa-${r.id}`,
      monthKey: r.updated_at.substring(0, 7),
      source: "CAA",
      label: `${c.denomination} · ${r.annee}`,
      montant: r.forfait,
      href: `/missions/caa?year=${r.annee}`,
    });
  }

  // AGO (honoraires_jur du client)
  type AgoRow = {
    id: string;
    annee: number;
    etat_facturation: string | null;
    updated_at: string;
    clients: { id: string; slug: string; denomination: string; honoraires_jur: number | null } | Array<{ id: string; slug: string; denomination: string; honoraires_jur: number | null }>;
  };
  for (const r of (agoRows ?? []) as AgoRow[]) {
    if (r.etat_facturation !== "facturee") continue;
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const f = c?.honoraires_jur ?? 0;
    if (f <= 0) continue;
    realised.push({
      key: `ago-${r.id}`,
      monthKey: r.updated_at.substring(0, 7),
      source: "AGO",
      label: `${c?.denomination ?? "?"} · ${r.annee}`,
      montant: f,
      href: `/obligations/ago-depot?year=${r.annee}`,
    });
  }

  // Bilan
  type BilanRow = {
    id: string;
    annee: number;
    etat_facturation: string | null;
    updated_at: string;
    clients: { id: string; slug: string; denomination: string; forfait_bilan: number | null; type_honos_bilans: string | null } | Array<{ id: string; slug: string; denomination: string; forfait_bilan: number | null; type_honos_bilans: string | null }>;
  };
  for (const r of (bilanRows ?? []) as BilanRow[]) {
    if (r.etat_facturation !== "facturee") continue;
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    if (c?.type_honos_bilans !== "Facturés") continue;
    const f = c?.forfait_bilan ?? 0;
    if (f <= 0) continue;
    realised.push({
      key: `bil-${r.id}`,
      monthKey: r.updated_at.substring(0, 7),
      source: "Bilan",
      label: `${c?.denomination ?? "?"} · ${r.annee}`,
      montant: f,
      href: `/obligations/liasses-plaquettes?year=${r.annee}`,
    });
  }

  // Missions exc
  type MexRow = {
    id: string;
    mission: string;
    etat_mission: string;
    etat_facturation: string | null;
    forfait: number | null;
    date_fin: string | null;
    updated_at: string;
    client_libre: string | null;
    clients: { slug: string; denomination: string } | Array<{ slug: string; denomination: string }> | null;
  };
  const missions = (missionRows ?? []) as MexRow[];
  for (const m of missions) {
    if (m.etat_facturation !== "facturee") continue;
    const f = m.forfait ?? 0;
    if (f <= 0) continue;
    const cc = Array.isArray(m.clients) ? m.clients[0] : m.clients;
    const name = cc?.denomination ?? m.client_libre ?? "?";
    realised.push({
      key: `mex-${m.id}`,
      monthKey: m.updated_at.substring(0, 7),
      source: "Mission exc.",
      label: `${name} · ${m.mission}`,
      montant: f,
      href: "/missions/exceptionnelles",
    });
  }

  // Récurrent récente "compté" comme facturé chaque mois pour les signés
  // On approxime : chaque client signé contribue MRR à chaque mois après sa signature
  // (jusqu'à aujourd'hui). C'est cohérent avec l'idée que le récurrent tourne.
  for (const c of signes) {
    if (!c.mois_signature) continue;
    const mrr = clientMrr(c);
    if (mrr <= 0) continue;
    const sigDate = new Date(c.mois_signature);
    if (Number.isNaN(sigDate.getTime())) continue;
    // Pour chaque mois entre signature et maintenant, ajouter MRR comme realisé
    const cur = new Date(sigDate.getFullYear(), sigDate.getMonth(), 1);
    while (cur <= now) {
      realised.push({
        key: `rec-${c.id}-${monthKey(cur)}`,
        monthKey: monthKey(cur),
        source: "Récurrent",
        label: c.denomination,
        montant: mrr,
        href: `/clients/${c.slug}`,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // ============================================================================
  // BLOC 2 : TIMELINE 24 mois (12 passe + 12 futur)
  // ============================================================================
  type ContribBucket = "realise" | "facturable" | "recurrent" | "ponctuel" | "pondere";
  type TimelineContrib = { source: string; label: string; montant: number; href: string; bucket: ContribBucket };
  type TimelineEntry = {
    key: string;
    label: string;
    isCurrent: boolean;
    isFuture: boolean;
    realise: number;
    facturable: number;
    recurrent: number;
    ponctuel: number;
    pondere: number;
    total: number;
    contribs: TimelineContrib[];
  };
  const timelineMonths = buildMonths(11, 12); // 24 mois centrés sur courant
  const timeline: TimelineEntry[] = timelineMonths.map((m) => {
    let realise = 0;
    const realisedThisMonth: RealiseItem[] = [];
    if (!m.isFuture) {
      for (const r of realised) {
        if (r.monthKey === m.key) {
          realise += r.montant;
          realisedThisMonth.push(r);
        }
      }
    }
    return {
      key: m.key,
      label: m.label,
      isCurrent: m.isCurrent,
      isFuture: m.isFuture,
      realise: Math.round(realise),
      facturable: 0,
      recurrent: 0,
      ponctuel: 0,
      pondere: 0,
      total: Math.round(realise),
      contribs: realisedThisMonth.map((r) => ({
        source: r.source,
        label: r.label,
        montant: r.montant,
        href: r.href,
        bucket: "realise" as ContribBucket,
      })),
    };
  });

  // ----- Projection futur : facturable maintenant -----
  const tm0Idx = timelineMonths.findIndex((m) => m.isCurrent);
  const tm0 = timeline[tm0Idx];

  // Helper to add a contrib
  function addContrib(mi: number, bucket: "facturable" | "recurrent" | "ponctuel" | "pondere", source: string, label: string, montant: number, href: string) {
    const tt = timeline[mi];
    tt[bucket] += montant;
    tt.total += montant;
    tt.contribs.push({ source, label, montant, href, bucket });
  }

  // Cash mobilisable maintenant (M+0)
  // IR à facturer
  const irToFactureKey = new Set<string>();
  for (const r of (irRowsRes.data ?? []) as IrRow[]) {
    if (r.statut_logique !== "TERMINE") continue;
    if (r.etat_facturation === "facturee" || r.etat_facturation === "sans_facture") continue;
    if (!r.forfait || r.forfait <= 0) continue;
    const c = Array.isArray(r.clients_ir) ? r.clients_ir[0] : r.clients_ir;
    if (!c) continue;
    const k = `${c.id}|${r.annee}`;
    if (irToFactureKey.has(k)) continue;
    irToFactureKey.add(k);
    const name = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ");
    addContrib(tm0Idx, "facturable", "IR + IFI", `${name} · ${r.annee}`, r.forfait, `/missions/ir?year=${r.annee}`);
  }
  // CAA à facturer
  for (const r of (caaRowsRes.data ?? []) as CaaRow[]) {
    if (r.statut_logique !== "TERMINE") continue;
    if (r.etat_facturation === "facturee" || r.etat_facturation === "sans_facture") continue;
    if (!r.forfait || r.forfait <= 0) continue;
    const c = Array.isArray(r.clients_caa) ? r.clients_caa[0] : r.clients_caa;
    if (!c) continue;
    addContrib(tm0Idx, "facturable", "CAA", `${c.denomination} · ${r.annee}`, r.forfait, `/missions/caa?year=${r.annee}`);
  }
  // AGO billable
  function isAgoBillable(detail: string | null, logique: string | null): boolean {
    if (logique === "TERMINE") return true;
    if (!detail) return false;
    const n = detail.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return n.includes("depose") || n.includes("valide");
  }
  type AgoRowFull = AgoRow & { statut_logique: string | null; statut_detail: string | null };
  for (const r of (agoRows ?? []) as AgoRowFull[]) {
    if (!isAgoBillable(r.statut_detail, r.statut_logique)) continue;
    if (r.etat_facturation === "facturee" || r.etat_facturation === "sans_facture") continue;
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const f = c?.honoraires_jur ?? 0;
    if (f <= 0) continue;
    addContrib(tm0Idx, "facturable", "AGO", `${c?.denomination ?? "?"} · ${r.annee}`, f, `/obligations/ago-depot?year=${r.annee}`);
  }
  // Bilan billable
  function isBilanBillable(detail: string | null, logique: string | null): boolean {
    if (logique === "TERMINE") return true;
    if (!detail) return false;
    const n = detail.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return n.includes("plaquette transmise") || n.includes("plaquette transmis");
  }
  type BilanRowFull = BilanRow & { statut_logique: string | null; statut_detail: string | null };
  for (const r of (bilanRows ?? []) as BilanRowFull[]) {
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    if (c?.type_honos_bilans !== "Facturés") continue;
    if (!isBilanBillable(r.statut_detail, r.statut_logique)) continue;
    if (r.etat_facturation === "facturee" || r.etat_facturation === "sans_facture") continue;
    const f = c?.forfait_bilan ?? 0;
    if (f <= 0) continue;
    addContrib(tm0Idx, "facturable", "Bilan", `${c?.denomination ?? "?"} · ${r.annee}`, f, `/obligations/liasses-plaquettes?year=${r.annee}`);
  }
  // Missions exc à facturer
  for (const m of missions) {
    if (m.etat_mission !== "livree") continue;
    if (m.etat_facturation === "facturee" || m.etat_facturation === "sans_facture") continue;
    const f = m.forfait ?? 0;
    if (f <= 0) continue;
    const cc = Array.isArray(m.clients) ? m.clients[0] : m.clients;
    const name = cc?.denomination ?? m.client_libre ?? "?";
    addContrib(tm0Idx, "facturable", "Mission exc.", `${name} · ${m.mission}`, f, "/missions/exceptionnelles");
  }
  tm0.total = Math.round(tm0.realise + tm0.facturable + tm0.recurrent + tm0.ponctuel + tm0.pondere);

  // Récurrent signé sur tous les mois futurs
  for (let i = tm0Idx + 1; i < timeline.length; i++) {
    for (const c of signes) {
      const mrr = clientMrr(c);
      if (mrr <= 0) continue;
      timeline[i].recurrent += mrr;
      // Contrib limité aux 2 premiers mois pour pas surcharger le drawer
      if (i - tm0Idx <= 2) {
        timeline[i].contribs.push({ source: "Récurrent", label: c.denomination, montant: mrr, href: `/clients/${c.slug}`, bucket: "recurrent" });
      }
    }
  }

  // Pondéré pipeline (étalé selon stade)
  for (const c of enCours) {
    const s = stadePrefix(c.pipeline_statut);
    if (!s || !STADE_DEF[s]) continue;
    const def = STADE_DEF[s];
    const mrr = clientMrr(c);
    if (mrr <= 0) continue;
    const sigDate = new Date(now);
    sigDate.setDate(sigDate.getDate() + def.delaiJours);
    let added = false;
    for (let i = tm0Idx; i < timeline.length; i++) {
      const tt = timeline[i];
      if (timelineMonths[i].date < new Date(sigDate.getFullYear(), sigDate.getMonth(), 1)) continue;
      const amount = mrr * def.ponderation;
      tt.pondere += amount;
      if (!added) {
        tt.contribs.push({
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

  // Recalcul totaux et arrondi
  for (let i = tm0Idx + 1; i < timeline.length; i++) {
    const t = timeline[i];
    t.facturable = Math.round(t.facturable);
    t.recurrent = Math.round(t.recurrent);
    t.ponctuel = Math.round(t.ponctuel);
    t.pondere = Math.round(t.pondere);
    t.total = t.realise + t.facturable + t.recurrent + t.ponctuel + t.pondere;
    t.contribs.sort((a, b) => b.montant - a.montant);
  }
  tm0.facturable = Math.round(tm0.facturable);
  tm0.contribs.sort((a, b) => b.montant - a.montant);

  // ============================================================================
  // BLOC 3 : MRR EVOLUTION 24 mois (signatures - resiliations)
  // ============================================================================
  const mrrMonths = buildMonths(23, 0); // 24 derniers mois
  const mrrEvolution = mrrMonths.map((m) => {
    let gain = 0;
    let loss = 0;
    const gainItems: { client: string; slug: string; montant: number }[] = [];
    const lossItems: { client: string; slug: string; montant: number }[] = [];
    // Gains : clients signes ce mois
    for (const c of signes) {
      if (!c.mois_signature) continue;
      if (c.mois_signature.substring(0, 7) === m.key) {
        const mrr = clientMrr(c);
        gain += mrr;
        gainItems.push({ client: c.denomination, slug: c.slug, montant: mrr });
      }
    }
    // Losses : clients resilies ce mois
    for (const c of resilies) {
      if (!c.pipeline_changed_at) continue;
      if (c.pipeline_changed_at.substring(0, 7) === m.key) {
        const mrr = clientMrr(c);
        loss += mrr;
        lossItems.push({ client: c.denomination, slug: c.slug, montant: mrr });
      }
    }
    return {
      key: m.key,
      label: m.label,
      gain: Math.round(gain),
      loss: Math.round(loss),
      net: Math.round(gain - loss),
      cumul: 0, // calculé après
      gainItems,
      lossItems,
    };
  });
  let mrrCumul = 0;
  for (const m of mrrEvolution) {
    mrrCumul += m.net;
    m.cumul = mrrCumul;
  }

  // ============================================================================
  // BLOC 4 : CA YTD réalisé + Atterrissage 31/12 + scenarios
  // ============================================================================
  const startOfYearKey = `${currentYear}-01`;
  const caYtd = realised
    .filter((r) => r.monthKey >= startOfYearKey)
    .reduce((s, r) => s + r.montant, 0);

  // Réalisé année dernière YTD-équivalent (pour comparaison MoM)
  // const lastYearYtdEnd = `${currentYear - 1}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastYearStart = `${currentYear - 1}-01`;
  const lastYearEnd = `${currentYear - 1}-12`;
  const caLastYear = realised
    .filter((r) => r.monthKey >= lastYearStart && r.monthKey <= lastYearEnd)
    .reduce((s, r) => s + r.montant, 0);

  // Atterrissage 31/12 : CA YTD + (recurrent x mois restants) + facturable + pondéré (sur mois restants)
  const recurrentMonthly = signes.reduce((s, c) => s + clientMrr(c), 0);
  const recurrentRemaining = recurrentMonthly * monthsRemaining;
  const facturableM0 = tm0.facturable;
  // Pondéré : on additionne les pondéré sur tous les mois jusqu'à fin d'année
  let pondereRestYear = 0;
  for (let i = tm0Idx; i < timeline.length; i++) {
    const d = timelineMonths[i].date;
    if (d.getFullYear() > currentYear) break;
    pondereRestYear += timeline[i].pondere;
  }
  const atterrissage = caYtd + facturableM0 + recurrentRemaining + pondereRestYear;

  // 3 scenarios
  const scenarioConservateur = caYtd + facturableM0 + recurrentRemaining + pondereRestYear * 0.6;
  const scenarioRealiste = atterrissage;
  const scenarioOptimiste = caYtd + facturableM0 + recurrentRemaining + (() => {
    // Optimiste = tout signé : on prend ARR brut au lieu de pondéré
    let optBrut = 0;
    for (const c of enCours) {
      const s = stadePrefix(c.pipeline_statut);
      if (!s || !STADE_DEF[s]) continue;
      const def = STADE_DEF[s];
      const mrr = clientMrr(c);
      const sigDate = new Date(now);
      sigDate.setDate(sigDate.getDate() + def.delaiJours);
      const sigMonth = new Date(sigDate.getFullYear(), sigDate.getMonth(), 1);
      // Combien de mois MRR cette année si signé à sigDate ?
      const moisRestantsApresSig = Math.max(0, (12 - sigMonth.getMonth()) - (sigMonth.getFullYear() > currentYear ? 12 : 0));
      optBrut += mrr * moisRestantsApresSig;
    }
    return optBrut;
  })();

  // Objectif annuel : placeholder = ARR signé actuel × 1.2
  const arrSigne = recurrentMonthly * 12;
  const objectifAnnuel = arrSigne; // simple : maintenir l'ARR actuel sur 12 mois
  // Atterrissage vs objectif
  const atterrissagePct = objectifAnnuel > 0 ? (atterrissage / objectifAnnuel) * 100 : 0;

  // ============================================================================
  // BLOC 5 : MRR ACTUEL et delta
  // ============================================================================
  const mrrCurrent = recurrentMonthly;
  const mrrCurrentMonth = mrrEvolution[mrrEvolution.length - 1];
  const mrrLastMonth = mrrEvolution[mrrEvolution.length - 2];
  const mrrDelta = mrrCurrentMonth.net;
  const mrrDeltaPrev = mrrLastMonth?.net ?? 0;
  const arr12mProjete = (mrrCurrent + mrrCurrentMonth.gain) * 12; // simplifié

  // ============================================================================
  // BLOC 6 : FUNNEL signatures
  // ============================================================================
  const funnel = Object.entries(STADE_DEF).map(([s, def]) => {
    const clientsStage = enCours.filter((c) => stadePrefix(c.pipeline_statut) === s);
    const arrBrut = clientsStage.reduce((sum, c) => sum + clientMrr(c) * 12 + clientOneShot(c), 0);
    const arrPondere = arrBrut * def.ponderation;
    // Temps moyen passé dans le stade
    const agesDays = clientsStage
      .filter((c) => c.pipeline_changed_at)
      .map((c) => Math.floor((todayMs - new Date(c.pipeline_changed_at!).getTime()) / (1000 * 60 * 60 * 24)));
    const avgAgeDays = agesDays.length > 0 ? Math.round(agesDays.reduce((a, b) => a + b, 0) / agesDays.length) : 0;
    return {
      stade: def.label,
      ponderation: def.ponderation,
      count: clientsStage.length,
      arrBrut: Math.round(arrBrut),
      arrPondere: Math.round(arrPondere),
      avgAgeDays,
      clients: clientsStage.map((c) => ({
        id: c.id,
        slug: c.slug,
        denomination: c.denomination,
        arrBrut: Math.round(clientMrr(c) * 12 + clientOneShot(c)),
        arrPondere: Math.round((clientMrr(c) * 12 + clientOneShot(c)) * def.ponderation),
        ageDays: c.pipeline_changed_at ? Math.floor((todayMs - new Date(c.pipeline_changed_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
      })).sort((a, b) => b.arrBrut - a.arrBrut),
    };
  });

  // ============================================================================
  // BLOC 7 : A activer maintenant
  // ============================================================================
  // Cash à débloquer : top items facturables maintenant
  const cashItems = tm0.contribs
    .filter((c) => c.bucket === "facturable")
    .slice(0, 5);

  // Deals à forcer : stade 6 (LDM envoyée) >30j ou stade 5 sans bouger
  const dealsItems: { title: string; subtitle: string; montant: number; href: string }[] = [];
  for (const c of enCours) {
    const s = stadePrefix(c.pipeline_statut);
    if (s !== "5" && s !== "6") continue;
    const ageDays = c.pipeline_changed_at ? Math.floor((todayMs - new Date(c.pipeline_changed_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    if (s === "6" && ageDays < 14) continue;
    if (s === "5" && ageDays < 7) continue;
    const arr = clientMrr(c) * 12 + clientOneShot(c);
    dealsItems.push({
      title: c.denomination,
      subtitle: `${STADE_DEF[s].label} · depuis ${ageDays} j`,
      montant: Math.round(arr * STADE_DEF[s].ponderation),
      href: `/clients/${c.slug}`,
    });
  }
  dealsItems.sort((a, b) => b.montant - a.montant);
  const dealsTop = dealsItems.slice(0, 5);

  // Risques : top 1/3/5 + churn risk (% concentration)
  const topClientsArr = signes
    .map((c) => ({ id: c.id, slug: c.slug, denomination: c.denomination, arr: clientMrr(c) * 12 }))
    .sort((a, b) => b.arr - a.arr);
  const top3 = topClientsArr.slice(0, 3);
  const top3Pct = arrSigne > 0 ? (top3.reduce((s, c) => s + c.arr, 0) / arrSigne) * 100 : 0;
  const risquesItems = top3.map((c) => ({
    title: c.denomination,
    subtitle: `${formatPct((c.arr / arrSigne) * 100, 1)} de l'ARR · ${formatEUR(c.arr)}`,
    montant: c.arr,
    href: `/clients/${c.slug}`,
  }));

  // ============================================================================
  // BLOC 8 : TENDANCES par catégorie activité
  // ============================================================================
  const ytdCaByCat = new Map<string, number>();
  for (const r of realised) {
    if (r.monthKey < startOfYearKey) continue;
    // On essaie de matcher le client par denom pour récupérer son activité
    // (approximation)
    const matchClient = clients.find((c) =>
      r.label.startsWith(c.denomination) || r.label.includes(`· ${c.denomination}`)
    );
    const cat = matchClient ? categorieActivite(matchClient.activite) : "Autre";
    ytdCaByCat.set(cat, (ytdCaByCat.get(cat) ?? 0) + r.montant);
  }
  const tendances = [...ytdCaByCat.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // ============================================================================
  // BLOC 9 : Sparkline 12 mois pour les hero
  // ============================================================================
  const sparkCaMensuel = timeline.slice(0, tm0Idx + 1).map((m) => ({ key: m.key, value: m.realise }));
  const sparkMrr = mrrEvolution.slice(-12).map((m) => ({ key: m.key, value: m.cumul }));
  const sparkAtterrissage = timeline.slice(tm0Idx).map((m) => ({ key: m.key, value: m.total }));

  const data: FinanceData = {
    hero: {
      caYtd: Math.round(caYtd),
      caLastYear: Math.round(caLastYear),
      caYtdLastYear: Math.round(
        realised
          .filter((r) => {
            const [y, mo] = r.monthKey.split("-").map(Number);
            return y === currentYear - 1 && mo <= now.getMonth() + 1;
          })
          .reduce((s, r) => s + r.montant, 0)
      ),
      atterrissage: Math.round(atterrissage),
      objectifAnnuel: Math.round(objectifAnnuel),
      atterrissagePct: Math.round(atterrissagePct),
      mrrCurrent: Math.round(mrrCurrent),
      mrrDelta: mrrDelta,
      mrrDeltaPrev: mrrDeltaPrev,
      arrProjete: Math.round(arr12mProjete),
      sparkCa: sparkCaMensuel,
      sparkMrr: sparkMrr,
      sparkAtterrissage,
    },
    timeline: timeline.map((t) => ({
      key: t.key,
      label: t.label,
      isCurrent: t.isCurrent,
      isFuture: t.isFuture,
      realise: t.realise,
      facturable: t.facturable,
      recurrent: t.recurrent,
      ponctuel: t.ponctuel,
      pondere: t.pondere,
      total: t.total,
      contribs: t.contribs,
    })),
    mrrEvolution,
    scenarios: {
      conservateur: Math.round(scenarioConservateur),
      realiste: Math.round(scenarioRealiste),
      optimiste: Math.round(scenarioOptimiste),
      objectif: Math.round(objectifAnnuel),
    },
    funnel,
    activate: {
      cashItems,
      dealsItems: dealsTop,
      risquesItems,
      top3Pct: Math.round(top3Pct),
    },
    tendances,
    currentYear,
    monthsRemaining,
  };

  void endOfYear;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance · Cockpit"
        description={`Réalisé · projection 12 mois · atterrissage ${currentYear} · scénarios & leviers`}
      />
      <FinanceDashboard data={data} />
    </div>
  );
}

// Helpers de format export (utilisés ici dans les agrégats narratifs)
function formatEUR(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " €";
}
function formatPct(n: number, decimals = 0): string {
  return n.toFixed(decimals) + " %";
}
