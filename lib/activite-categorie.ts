/**
 * Mapping libellé d'activité NAF brut -> catégorie métier MOON Expertise.
 *
 * Sert à regrouper les libellés NAF officiels (genre "Conseil pour les
 * affaires et autres conseils de gestion") en catégories métier large pour
 * la stat "Mix activité" du dashboard.
 *
 * Logique : pattern matching sur des mots-clés du libellé en minuscules.
 * Premier match gagne. L'ordre est important (les patterns les plus
 * spécifiques d'abord).
 *
 * Si aucun match : retourne `Services divers` (fallback générique).
 * Pas de catégorie "Autres" - toutes les activités sont catégorisées.
 */

export type ActiviteCategorie =
  | "Activités juridiques"
  | "Conseil & gestion"
  | "Tech & numérique"
  | "Immobilier"
  | "Design & création"
  | "Communication & médias"
  | "Holding & finance"
  | "Formation"
  | "Santé & paramédical"
  | "Restauration & hôtellerie"
  | "Commerce & e-commerce"
  | "BTP & artisanat"
  | "Bien-être & beauté"
  | "Services aux personnes"
  | "Industrie & fabrication"
  | "Transport & logistique"
  | "Sport & loisirs"
  | "Services divers";

/**
 * Liste ordonnée de (mots-clés, catégorie). Le premier qui matche le libellé
 * (case-insensitive, substring) donne la catégorie. L'ordre prime : on met
 * les patterns spécifiques avant les génériques.
 */
const PATTERNS: Array<{ keys: string[]; cat: ActiviteCategorie }> = [
  // Holding / finance : très spécifique, doit passer avant "siège social"
  {
    keys: ["holding", "siège social", "siege social", "fonds de placement", "société financière", "courtage", "intermédiation"],
    cat: "Holding & finance",
  },
  // Tech / IT
  {
    keys: ["programmation", "informatique", "logiciel", "système informatique", "hébergement", "traitement de données", "edition de logiciels", "édition de logiciels", "portail internet"],
    cat: "Tech & numérique",
  },
  // Design / création
  {
    keys: ["design", "architecture", "photographie", "arts plastiques", "création artistique", "graphisme"],
    cat: "Design & création",
  },
  // Communication & médias (avant "conseil" qui est plus large)
  {
    keys: ["publicité", "relations publiques", "communication", "édition de journaux", "edition de journaux", "audiovisuel", "production cinématographique", "radiodiffusion", "presse"],
    cat: "Communication & médias",
  },
  // Activités juridiques (avocats, notaires, huissiers - separe de
  // Conseil & gestion sur demande Benjamin).
  {
    keys: ["avocat", "activités juridiques", "activites juridiques", "notaire", "huissier"],
    cat: "Activités juridiques",
  },
  // Conseil & gestion (sans le juridique)
  {
    keys: ["conseil pour les affaires", "conseil en gestion", "études de marché", "etudes de marche"],
    cat: "Conseil & gestion",
  },
  // Formation
  {
    keys: ["formation", "enseignement", "écoles", "ecoles", "université", "universite"],
    cat: "Formation",
  },
  // Immobilier
  {
    keys: ["location de logement", "location de bien", "location immobilière", "marchand de bien", "agent immobilier", "agence immobilière", "agence immobiliere", "promotion immobilière", "promotion immobiliere", "syndic", "gestion immobilière", "gestion immobiliere", "immobilier"],
    cat: "Immobilier",
  },
  // Santé
  {
    keys: ["médecin", "medecin", "dentiste", "kiné", "kine", "infirmier", "pratique médicale", "pratique medicale", "santé", "sante", "psychologue", "ostéopathe", "osteopathe", "podologue", "orthophoniste"],
    cat: "Santé & paramédical",
  },
  // Restauration / hôtellerie
  {
    keys: ["restaurant", "restauration", "hôtel", "hotel", "débit de boisson", "debit de boisson", "café", "cafe", "traiteur", "boulangerie", "pâtisserie", "patisserie"],
    cat: "Restauration & hôtellerie",
  },
  // BTP & artisanat
  {
    keys: ["travaux", "construction", "maçonnerie", "maconnerie", "électricien", "electricien", "plomberie", "menuiserie", "peinture", "couverture", "rénovation", "renovation", "bâtiment", "batiment", "second œuvre", "second oeuvre", "gros œuvre", "gros oeuvre"],
    cat: "BTP & artisanat",
  },
  // Bien-être & beauté
  {
    keys: ["coiffure", "soins de beauté", "soins de beaute", "esthétique", "esthetique", "bien-être", "bien etre", "massage", "manucure"],
    cat: "Bien-être & beauté",
  },
  // Transport & logistique
  {
    keys: ["transport", "logistique", "messagerie", "fret", "déménagement", "demenagement", "taxi", "vtc"],
    cat: "Transport & logistique",
  },
  // Sport & loisirs
  {
    keys: ["sport", "salle de sport", "fitness", "coaching sportif", "loisir", "divertissement", "jeux"],
    cat: "Sport & loisirs",
  },
  // Industrie & fabrication
  {
    keys: ["fabrication", "production", "industrie", "métallurgie", "metallurgie", "usinage"],
    cat: "Industrie & fabrication",
  },
  // Commerce & e-commerce
  {
    keys: ["commerce de détail", "commerce de detail", "commerce de gros", "vente à distance", "vente a distance", "vente en magasin", "e-commerce", "boutique", "magasin", "supermarché", "supermarche"],
    cat: "Commerce & e-commerce",
  },
  // Services aux personnes
  {
    keys: ["services à la personne", "services a la personne", "aide à domicile", "aide a domicile", "garde d'enfant", "ménage", "menage"],
    cat: "Services aux personnes",
  },
];

/**
 * Regroupe un libellé d'activité dans sa catégorie métier.
 *
 *   categorieActivite("Conseil pour les affaires et autres conseils de gestion")
 *   // → "Conseil & gestion"
 *
 *   categorieActivite(null)
 *   // → "Services divers"
 */
export function categorieActivite(libelle: string | null | undefined): ActiviteCategorie {
  if (!libelle) return "Services divers";
  const lc = libelle.toLowerCase();
  for (const { keys, cat } of PATTERNS) {
    if (keys.some((k) => lc.includes(k))) return cat;
  }
  return "Services divers";
}
