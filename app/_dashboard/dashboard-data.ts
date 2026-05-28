import { createClient } from "@/lib/supabase/server";
import { categorieActivite } from "@/lib/activite-categorie";

/**
 * Loader d'agrégats pour le dashboard d'accueil.
 *
 * Toutes les queries Postgres sont lancées en parallèle (Promise.all) pour
 * minimiser la latence. On agrège côté JS - les volumes sont petits (~80
 * clients, ~quelques milliers d'obligations) donc pas besoin de SQL agrégé
 * côté serveur. Si le volume monte, on switchera vers des vues matérialisées.
 */

export type DashboardData = {
  /** Stats globales du cabinet. */
  kpi: {
    clientsActifs: number;
    mrr: number;
    arr: number;
    signaturesCeMois: number;
    arrSigneCeMois: number;
  };
  /** Funnel pipeline : nb de dossiers par étape (toutes étapes même à 0). */
  pipeline: Array<{ statut: string; count: number; arr: number; color: string }>;
  /** Signatures par mois sur les 12 derniers mois (mois_signature). */
  signaturesParMois: Array<{
    monthKey: string; // ex. "2025-12"
    monthLabel: string; // ex. "déc. 2025"
    count: number;
    arr: number;
    cumulCountYtd: number;
    cumulArrYtd: number;
  }>;
  /** Top 10 clients par ARR. */
  topClients: Array<{
    id: string;
    slug: string;
    denomination: string;
    arr: number;
    pipeline_statut: string | null;
  }>;
  /** Répartition par activité (top 8 + "Autre"). */
  mixActivite: Array<{ name: string; value: number }>;
  /** Santé production : obligations à risque. */
  productionRisque: {
    enRetard: number; // échéance passée, non terminée
    sous7Jours: number; // échéance dans les 7 prochains jours
    sous30Jours: number; // dans les 30 prochains jours
  };
};

const PIPELINE_ORDER = [
  "1 - Tally à envoyer",
  "2 - Tally à compléter",
  "3 - PC à préparer",
  "4 - PC envoyée",
  "5 - PC acceptée",
  "6 - LDM envoyée",
  "7 - LDM signée",
  "Z - Interne",
  "Z - Sous-traitance",
  "Z - Prospect perdu",
  "Z - Résiliée",
];

// Couleurs cohérentes avec PIPELINE_COLORS (palette MOON). Hex pour Recharts.
const PIPELINE_HEX: Record<string, string> = {
  "1 - Tally à envoyer": "#a1a1aa",
  "2 - Tally à compléter": "#71717a",
  "3 - PC à préparer": "#f59e0b",
  "4 - PC envoyée": "#3b82f6",
  "5 - PC acceptée": "#06b6d4",
  "6 - LDM envoyée": "#8b5cf6",
  "7 - LDM signée": "#10b981",
  "Z - Interne": "#10b981",
  "Z - Sous-traitance": "#0ea5e9",
  "Z - Prospect perdu": "#ef4444",
  "Z - Résiliée": "#ef4444",
};

/**
 * Dossiers comptes comme CLIENTS dans les KPI business (nombre de clients,
 * MRR / ARR, panier moyen, top 10, mix activite).
 *
 *   - "7 - LDM signee" UNIQUEMENT
 *
 * Les dossiers en Z - Interne (Benjamin lui-meme + famille) et Z - Sous-
 * traitance ne sont PAS des clients reels : on les gere cote production /
 * onboarding (cf. isClientBillable dans lib/billable.ts) mais on ne les
 * inclut plus dans les agregats business, qui se voulaient deformes.
 */
const CLIENTS_LDM = new Set(["7 - LDM signée"]);

/**
 * Dossiers a gerer cote PRODUCTION (obligations, echeances, onboarding).
 * Couvre LDM + Interne + Sous-traitance. Utilise pour productionRisque.
 */
const DOSSIERS_GERES = new Set([
  "7 - LDM signée",
  "Z - Interne",
  "Z - Sous-traitance",
]);
// Origines équivalentes à "en sous-traitance" (nouvelle nomenclature + legacy).
const ORIGINES_ST = new Set(["5 - Sous-traitance", "Z - Sous-traitance"]);

export async function loadDashboardData(): Promise<DashboardData> {
  const sb = await createClient();
  const todayIso = new Date().toISOString().substring(0, 10);
  const startOfMonth = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();
  // Fenêtre 12 derniers mois (incl. mois en cours)
  const twelveMonthsAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    d.setDate(1);
    return d.toISOString().substring(0, 10);
  })();
  // Année courante pour YTD
  const currentYear = new Date().getFullYear();
  const startOfYear = `${currentYear}-01-01`;

  const [
    { data: clients },
    { data: obligations },
  ] = await Promise.all([
    sb
      .from("clients")
      .select(
        "id, slug, denomination, pipeline_statut, origine, arr, mrr, activite, mois_signature"
      ),
    sb
      .from("obligations")
      .select(
        "echeance, statut_logique, obligation_subscriptions!inner(actif), clients!inner(pipeline_statut, origine)"
      )
      .gte("echeance", twelveMonthsAgo) // limite la taille du fetch
      .eq("obligation_subscriptions.actif", true),
  ]);

  const cs = (clients ?? []) as Array<{
    id: string;
    slug: string;
    denomination: string;
    pipeline_statut: string | null;
    origine: string | null;
    arr: number | null;
    mrr: number | null;
    activite: string | null;
    mois_signature: string | null;
  }>;

  // --- KPI globaux ---
  // "Client" = uniquement pipeline_statut = "7 - LDM signée".
  // Les dossiers Z - Interne (Benjamin + famille) et Z - Sous-traitance ne
  // sont pas des clients : ils n'ont pas signe de LDM commerciale, donc on
  // les sort de toutes les agregations business (nombre, MRR, ARR, panier
  // moyen, top, mix activite). Cf. commentaire CLIENTS_LDM.
  function isClient(c: { pipeline_statut: string | null }) {
    return c.pipeline_statut !== null && CLIENTS_LDM.has(c.pipeline_statut);
  }
  const actifs = cs.filter(isClient);
  const totalMrr = actifs.reduce((s, c) => s + (c.mrr ?? 0), 0);
  const totalArr = actifs.reduce((s, c) => s + (c.arr ?? 0), 0);
  const signaturesCeMois = cs.filter(
    (c) =>
      c.pipeline_statut === "7 - LDM signée" &&
      c.mois_signature &&
      c.mois_signature >= startOfMonth
  );
  const signaturesCeMoisCount = signaturesCeMois.length;
  const arrSigneCeMois = signaturesCeMois.reduce((s, c) => s + (c.arr ?? 0), 0);

  // --- Pipeline funnel ---
  const pipelineMap = new Map<string, { count: number; arr: number }>();
  for (const s of PIPELINE_ORDER) pipelineMap.set(s, { count: 0, arr: 0 });
  for (const c of cs) {
    const key = c.pipeline_statut ?? "(sans statut)";
    if (!pipelineMap.has(key)) pipelineMap.set(key, { count: 0, arr: 0 });
    const agg = pipelineMap.get(key)!;
    agg.count++;
    agg.arr += c.arr ?? 0;
  }
  const pipeline = PIPELINE_ORDER.map((s) => ({
    statut: s,
    count: pipelineMap.get(s)?.count ?? 0,
    arr: pipelineMap.get(s)?.arr ?? 0,
    color: PIPELINE_HEX[s] ?? "#a1a1aa",
  }));

  // --- Signatures par mois (12 derniers mois) ---
  // On construit la grille des 12 mois et on agrège
  const monthFr = (d: Date) =>
    d
      .toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
      .replace(/^./, (c) => c.toLowerCase());
  const months: Array<{ key: string; label: string; date: Date }> = [];
  {
    const start = new Date();
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: monthFr(d),
        date: d,
      });
    }
  }
  const sigByMonth = new Map<string, { count: number; arr: number }>();
  for (const m of months) sigByMonth.set(m.key, { count: 0, arr: 0 });
  for (const c of cs) {
    if (c.pipeline_statut !== "7 - LDM signée") continue;
    if (!c.mois_signature) continue;
    const key = c.mois_signature.substring(0, 7); // "YYYY-MM"
    const agg = sigByMonth.get(key);
    if (agg) {
      agg.count++;
      agg.arr += c.arr ?? 0;
    }
  }
  // Cumul YTD : reset au 1er janvier de chaque année
  let cumulCount = 0;
  let cumulArr = 0;
  const signaturesParMois = months.map((m) => {
    if (m.date.getMonth() === 0) {
      // Janvier : reset YTD
      cumulCount = 0;
      cumulArr = 0;
    }
    const monthData = sigByMonth.get(m.key) ?? { count: 0, arr: 0 };
    cumulCount += monthData.count;
    cumulArr += monthData.arr;
    return {
      monthKey: m.key,
      monthLabel: m.label,
      count: monthData.count,
      arr: monthData.arr,
      cumulCountYtd: cumulCount,
      cumulArrYtd: cumulArr,
    };
  });

  // --- Top 10 clients par ARR (actifs uniquement) ---
  const topClients = [...actifs]
    .sort((a, b) => (b.arr ?? 0) - (a.arr ?? 0))
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      arr: c.arr ?? 0,
      pipeline_statut: c.pipeline_statut,
    }));

  // --- Mix par catégorie métier MOON (regroupements) ---
  // On ne montre plus les libellés NAF bruts (trop granulaires) ni de
  // catégorie "Autres" (cul-de-sac inutile). Chaque client est rangé dans
  // sa catégorie métier via `categorieActivite(libelleNaf)`.
  const categorieMap = new Map<string, number>();
  for (const c of actifs) {
    const key = categorieActivite(c.activite);
    categorieMap.set(key, (categorieMap.get(key) ?? 0) + 1);
  }
  const mixActivite = [...categorieMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // --- Production à risque ---
  type OblRow = {
    echeance: string | null;
    statut_logique: string | null;
    clients: { pipeline_statut: string | null; origine: string | null };
  };
  let enRetard = 0;
  let sous7Jours = 0;
  let sous30Jours = 0;
  const sevenDaysIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().substring(0, 10);
  })();
  const thirtyDaysIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().substring(0, 10);
  })();
  for (const o of (obligations ?? []) as unknown as OblRow[]) {
    const c = o.clients;
    // Production : on couvre les dossiers reellement geres (LDM + Interne +
    // ST), pas seulement les clients commerciaux. Benjamin doit aussi voir
    // les obligations en retard sur ses dossiers internes.
    if (
      !(
        (c.pipeline_statut && DOSSIERS_GERES.has(c.pipeline_statut)) ||
        (c.origine && ORIGINES_ST.has(c.origine))
      )
    )
      continue;
    if (!o.echeance) continue;
    const done =
      o.statut_logique === "TERMINE" || o.statut_logique === "NON_APPLICABLE";
    if (done) continue;
    if (o.echeance < todayIso) enRetard++;
    else if (o.echeance <= sevenDaysIso) sous7Jours++;
    else if (o.echeance <= thirtyDaysIso) sous30Jours++;
  }

  // Silencer unused (utilisé en debug si besoin)
  void startOfYear;

  return {
    kpi: {
      clientsActifs: actifs.length,
      mrr: totalMrr,
      arr: totalArr,
      signaturesCeMois: signaturesCeMoisCount,
      arrSigneCeMois,
    },
    pipeline,
    signaturesParMois,
    topClients,
    mixActivite,
    productionRisque: { enRetard, sous7Jours, sous30Jours },
  };
}
