/**
 * Configuration des trackers d'obligations (1 par sous-page Notion).
 * Chaque tracker regroupe 1 ou plusieurs types d'obligation et définit
 * les colonnes (périodes) affichées en table.
 */

export type TrackerGroup = "tva" | "is" | "ago" | "bilan" | "autres";

export type Tracker = {
  slug: string;
  title: string;
  /** Sous-bloc auquel ce tracker appartient */
  group: TrackerGroup;
  description?: string;
  /** Pictogramme affiché sur la carte dashboard */
  icon?: string;
  /** Couleur d'accent du bandeau (Tailwind class fragment) */
  accent?: "amber" | "rose" | "violet" | "emerald" | "sky" | "zinc";
  /** Règles métier en bullets · affichées dans la carte dashboard */
  notes?: Array<{ highlight?: string; text: string }>;
  types: string[]; // types d'obligation regroupés dans ce tracker
  cols: (year: number) => Array<{
    key: string;
    label: string;
    type: string;
    periode: string;
    /** Type de rendu de la cellule. "status" (default) = picker statut
     *  Notion-like. "facturation" = picker facturation (a_facturer / facturee
     *  / sans_facture). Permet d'avoir 2 colonnes pour une meme obligation :
     *  une pour le statut metier, une pour la facturation. */
    kind?: "status" | "facturation";
  }>;
};

/**
 * Ordre d'affichage des sous-blocs dans le sommaire et la sidebar.
 */
export const TRACKER_GROUPS: { id: TrackerGroup; label: string }[] = [
  { id: "tva", label: "TVA" },
  { id: "is", label: "IS · Impôt sur les sociétés" },
  { id: "ago", label: "AGO" },
  { id: "bilan", label: "Suivi Bilan" },
  { id: "autres", label: "Autres déclarations" },
];

const MONTHS_SHORT = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const pad = (n: number) => String(n).padStart(2, "0");

export const TRACKERS: Tracker[] = [
  {
    slug: "tva-mensuelle",
    title: "TVA mensuelle (CA3M)",
    group: "tva",
    description: "12 déclarations CA3M, échéance le 24 du mois M+1.",
    icon: "💰",
    accent: "amber",
    notes: [{ text: "Échéance le 24 du mois suivant." }],
    types: ["TVA_MENSUELLE"],
    cols: (y) =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return {
          key: `${y}-${pad(m)}`,
          label: MONTHS_SHORT[i],
          type: "TVA_MENSUELLE",
          periode: `${y}-${pad(m)}`,
        };
      }),
  },
  {
    slug: "tva-trimestrielle",
    title: "TVA trimestrielle (CA3T)",
    group: "tva",
    description: "4 déclarations CA3T, échéance 24 du mois suivant la fin du trimestre.",
    icon: "💰",
    accent: "amber",
    notes: [
      { text: "TVA au 24/04" },
      { text: "TVA au 24/07" },
      { text: "TVA au 24/10" },
      { text: "TVA au 24/01" },
    ],
    types: ["TVA_TRIMESTRIELLE"],
    cols: (y) => [1, 2, 3, 4].map((q) => ({
      key: `T${q}-${y}`,
      label: `T${q}`,
      type: "TVA_TRIMESTRIELLE",
      periode: `T${q}-${y}`,
    })),
  },
  {
    slug: "ca12",
    title: "CA12 · acomptes et solde",
    group: "tva",
    description: "Acpt 1 (15/07), Acpt 2 (15/12), Solde (clôture + 3m + 3j).",
    icon: "💰",
    accent: "amber",
    notes: [
      { highlight: "Acompte si TVA à décaisser N-1 supérieure à 1 000 €", text: "" },
      { text: "Acompte 1 · 15/07 · 55% du montant" },
      { text: "Acompte 2 · 15/12 · 40% du montant" },
      { text: "Solde : clôture + 3 mois + 3 jours (clôture 31/12 → 03/05 N+1)" },
    ],
    types: ["TVA_ANNUELLE_CA12"],
    cols: (y) => [
      { key: `ca12-a1-${y}`, label: "Acpt 07", type: "TVA_ANNUELLE_CA12", periode: `A-07-${y}` },
      { key: `ca12-a2-${y}`, label: "Acpt 12", type: "TVA_ANNUELLE_CA12", periode: `A-12-${y}` },
      { key: `ca12-s-${y}`, label: "Solde", type: "TVA_ANNUELLE_CA12", periode: `S-${y}` },
    ],
  },
  {
    slug: "oss",
    title: "Suivi OSS TVA",
    group: "tva",
    description: "Déclarations OSS trimestrielles, échéance 15 du mois suivant trimestre.",
    icon: "💰",
    accent: "amber",
    notes: [
      { text: "T1 → 15/04" },
      { text: "T2 → 15/07" },
      { text: "T3 → 15/10" },
      { text: "T4 → 15/01 N+1" },
    ],
    types: ["OSS"],
    cols: (y) => [1, 2, 3, 4].map((q) => ({
      key: `oss-t${q}-${y}`,
      label: `T${q}`,
      type: "OSS",
      periode: `T${q}-${y}`,
    })),
  },
  {
    slug: "des",
    title: "Suivi DES",
    group: "tva",
    description: "Déclarations européennes de services, échéance le 10 du mois M+1.",
    icon: "💰",
    accent: "amber",
    notes: [{ text: "Échéance le 10 du mois suivant." }],
    types: ["DES"],
    cols: (y) =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return {
          key: `des-${y}-${pad(m)}`,
          label: MONTHS_SHORT[i],
          type: "DES",
          periode: `${y}-${pad(m)}`,
        };
      }),
  },
  {
    slug: "is-acomptes",
    title: "IS · acomptes",
    group: "is",
    description: "4 acomptes IS : 15/03, 15/06, 15/09, 15/12.",
    icon: "💰",
    accent: "amber",
    notes: [
      { highlight: "Acompte si IS N-1 supérieur à 3 000 €", text: "" },
      { text: "Acompte 1 · 15/03" },
      { text: "Acompte 2 · 15/06" },
      { text: "Acompte 3 · 15/09" },
      { text: "Acompte 4 · 15/12" },
    ],
    types: ["IS_ACOMPTE"],
    cols: (y) => [3, 6, 9, 12].map((m) => ({
      key: `is-a${pad(m)}-${y}`,
      label: `${MONTHS_SHORT[m - 1]}`,
      type: "IS_ACOMPTE",
      periode: `A-${pad(m)}-${y}`,
    })),
  },
  {
    slug: "is-solde",
    title: "IS · soldes",
    group: "is",
    description: "Solde IS : clôture + 3 mois + 18 jours.",
    icon: "💰",
    accent: "amber",
    notes: [
      { text: "Solde IS au 15/05 sauf clôtures décalées." },
      { text: "Clôture décalée : 3 mois + 18 jours à compter de la clôture." },
    ],
    types: ["IS_SOLDE"],
    cols: (y) => [
      { key: `is-solde-${y}`, label: "Solde IS", type: "IS_SOLDE", periode: `${y}` },
    ],
  },
  {
    slug: "cvae",
    title: "CVAE · acomptes et solde",
    group: "autres",
    description: "Acomptes 15/06 et 15/09, solde 1329-DEF à la date IS solde.",
    icon: "💰",
    accent: "amber",
    notes: [
      { highlight: "Acompte si CVAE N-1 supérieure à 1 500 €", text: "" },
      { text: "Acompte 1 · 15/06 · 50% du montant" },
      { text: "Acompte 2 · 15/09 · 50% du montant" },
      { text: "Solde 1329-DEF : même date que IS solde / liasse." },
    ],
    types: ["CVAE", "CVAE_ACOMPTE"],
    cols: (y) => [
      { key: `cvae-a06-${y}`, label: "Acpt 06", type: "CVAE_ACOMPTE", periode: `A-06-${y}` },
      { key: `cvae-a09-${y}`, label: "Acpt 09", type: "CVAE_ACOMPTE", periode: `A-09-${y}` },
      { key: `cvae-s-${y}`, label: "Solde", type: "CVAE", periode: `${y}` },
    ],
  },
  {
    slug: "tvs",
    title: "TVS",
    group: "tva",
    description: "TVS annuelle, échéance 24/01 N+1.",
    icon: "🚗",
    accent: "amber",
    notes: [{ text: "Échéance 24/01 N+1, alignée sur la dernière TVA de l'année." }],
    types: ["TVS"],
    cols: (y) => [{ key: `tvs-${y}`, label: "TVS", type: "TVS", periode: `${y}` }],
  },
  {
    slug: "das2",
    title: "Déclarations DAS2",
    group: "autres",
    description: "DAS2 sur année civile, échéance 03/05 N+1.",
    icon: "🙇",
    accent: "rose",
    notes: [
      { text: "Déclarations sur années civiles pour chaque année." },
      { text: "Attention aux clôtures décalées." },
    ],
    types: ["DAS2"],
    cols: (y) => [{ key: `das2-${y}`, label: "DAS2", type: "DAS2", periode: `${y}` }],
  },
  {
    slug: "decl-2561",
    title: "IFU · Dividendes 2561",
    group: "ago",
    description: "Échéance 15/02 N+1, suivant l'année de distribution.",
    icon: "📄",
    accent: "violet",
    notes: [{ text: "15/02 N+1, suivant l'année de distribution des dividendes." }],
    types: ["DECL_2561"],
    cols: (y) => [{ key: `2561-${y}`, label: "IFU 2561", type: "DECL_2561", periode: `${y}` }],
  },
  {
    slug: "decl-2777",
    title: "Flat-tax Dividendes 2777",
    group: "ago",
    description: "Pas d'échéance automatique · suivi de la réalisation.",
    icon: "📄",
    accent: "violet",
    notes: [{ text: "Pas d'échéance · suivi de la réalisation de l'obligation." }],
    types: ["DECL_2777"],
    cols: (y) => [{ key: `2777-${y}`, label: "Flat-tax 2777", type: "DECL_2777", periode: `${y}` }],
  },
  {
    slug: "liasses-plaquettes",
    title: "Liasses & Plaquettes",
    group: "bilan",
    description: "Échéance clôture + 3 mois + 18 jours. Colonne facturation séparée pour les bilans facturés.",
    icon: "📄",
    accent: "emerald",
    notes: [
      { text: "Clôture + 3 mois + 18 jours (clôture 31/12 → 18/05 N+1)." },
      { text: "Facturation bilan : colonne séparée à côté du statut (visible si type_honos_bilans = 'Facturés')." },
    ],
    types: ["LIASSE_PLAQUETTE"],
    cols: (y) => [
      { key: `liasse-${y}`, label: "Liasse", type: "LIASSE_PLAQUETTE", periode: `${y}` },
      { key: `liasse-fact-${y}`, label: "Facturation", type: "LIASSE_PLAQUETTE", periode: `${y}`, kind: "facturation" },
    ],
  },
  {
    slug: "ago-depot",
    title: "AGO",
    group: "ago",
    description: "Échéance clôture + 6 mois (dernier jour du mois). Colonne facturation juridique séparée.",
    icon: "📌",
    accent: "rose",
    notes: [
      { text: "Clôture + 6 mois (clôture 31/12 → 30/06 N+1)." },
      { text: "Facturation juridique : colonne séparée à côté du statut AGO." },
    ],
    types: ["AGO_DEPOT"],
    cols: (y) => [
      { key: `ago-${y}`, label: "AGO", type: "AGO_DEPOT", periode: `${y}` },
      { key: `ago-fact-${y}`, label: "Facturation jur.", type: "AGO_DEPOT", periode: `${y}`, kind: "facturation" },
    ],
  },
];

export function getTracker(slug: string): Tracker | undefined {
  return TRACKERS.find((t) => t.slug === slug);
}

/**
 * À partir d'un type d'obligation, renvoie le slug du tracker qui le couvre.
 * (Certains slugs comme "cvae" couvrent plusieurs types : CVAE + CVAE_ACOMPTE.)
 */
export function slugForType(type: string): string | null {
  for (const t of TRACKERS) {
    if (t.types.includes(type)) return t.slug;
  }
  return null;
}
