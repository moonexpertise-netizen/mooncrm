/**
 * Modèles de mails libres (table `mail_templates`, migration 0093).
 *
 * À ne pas confondre avec `lib/email-templates-defaults.ts` : celui-ci gère les
 * DEUX modèles système figés (guide création / reprise, bouton « Envoyer le
 * guide »). Ici, ce sont les modèles créés librement depuis
 * /parametrage/emails, générés en .eml depuis la fiche client (bouton
 * « Générer mail ») ou en masse depuis /documents.
 *
 * Ce module est ISOMORPHE (aucun import serveur) : la fiche client et l'éditeur
 * l'utilisent pour l'aperçu en direct, les routes API pour la génération.
 * L'assemblage du fichier .eml vit dans `lib/eml.ts` (server-only).
 */

export type MailTemplate = {
  id: string;
  nom: string;
  categorie: string | null;
  objet: string;
  corps: string;
  actif: boolean;
  ordre: number;
};

/** Colonnes clients nécessaires à la substitution des variables. */
export const MAIL_CLIENT_SELECT =
  "id, slug, denomination, siren, forme, activite, regime, adresse_siege, code_postal, ville, jour_cloture, mois_cloture, email, fin_mission_date";

export type MailClientRow = {
  denomination: string;
  siren: string | null;
  forme: string | null;
  activite: string | null;
  regime: string | null;
  adresse_siege: string | null;
  code_postal: string | null;
  ville: string | null;
  jour_cloture: number | string | null;
  mois_cloture: number | string | null;
  email: string | null;
  fin_mission_date: string | null;
};

export type MailDirigeant = {
  civilite: string | null;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
} | null;

/** Catalogue des variables, tel qu'affiché dans l'éditeur (ordre = affichage). */
export const MAIL_VARIABLES: {
  cle: string;
  libelle: string;
  groupe: "Dossier" | "Dirigeant" | "Contexte";
}[] = [
  { cle: "denomination", libelle: "Nom du dossier", groupe: "Dossier" },
  { cle: "siren", libelle: "SIREN", groupe: "Dossier" },
  { cle: "forme", libelle: "Forme juridique", groupe: "Dossier" },
  { cle: "activite", libelle: "Activité", groupe: "Dossier" },
  { cle: "regime", libelle: "Régime (IR / IS)", groupe: "Dossier" },
  { cle: "adresse", libelle: "Adresse du siège", groupe: "Dossier" },
  { cle: "code_postal", libelle: "Code postal", groupe: "Dossier" },
  { cle: "ville", libelle: "Ville", groupe: "Dossier" },
  { cle: "cloture", libelle: "Date de clôture (31/12)", groupe: "Dossier" },
  { cle: "salutation", libelle: "Salutation (Monsieur Dupont)", groupe: "Dirigeant" },
  { cle: "civilite", libelle: "Civilité (M. / Mme)", groupe: "Dirigeant" },
  { cle: "prenom", libelle: "Prénom du dirigeant", groupe: "Dirigeant" },
  { cle: "nom", libelle: "Nom du dirigeant", groupe: "Dirigeant" },
  { cle: "email", libelle: "E-mail du dirigeant", groupe: "Dirigeant" },
  { cle: "telephone", libelle: "Téléphone du dirigeant", groupe: "Dirigeant" },
  { cle: "date_du_jour", libelle: "Date du jour", groupe: "Contexte" },
  { cle: "annee", libelle: "Année en cours", groupe: "Contexte" },
  { cle: "mon_prenom", libelle: "Mon prénom", groupe: "Contexte" },
  { cle: "mon_nom", libelle: "Mon nom", groupe: "Contexte" },
  { cle: "mon_email", libelle: "Mon e-mail", groupe: "Contexte" },
];

const VARIABLE_KEYS = new Set(MAIL_VARIABLES.map((v) => v.cle));

const CIVILITE_LONGUE: Record<string, string> = {
  "M.": "Monsieur",
  Mme: "Madame",
  Mlle: "Mademoiselle",
};

/** Capitalise un fragment d'e-mail : "benjamin" -> "Benjamin", "le-goff" -> "Le-Goff". */
function capitalize(s: string): string {
  return s
    .split(/([-'])/)
    .map((part) =>
      part.length > 1 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join("");
}

/**
 * Prénom / nom déduits de l'e-mail professionnel (prenom.nom@moonexpertise.fr).
 * `profiles` ne stocke pas l'état civil : c'est la seule source disponible.
 */
export function identiteDepuisEmail(email: string | null): {
  prenom: string;
  nom: string;
} {
  const local = (email ?? "").split("@")[0] ?? "";
  const [p, ...reste] = local.split(".");
  return {
    prenom: p ? capitalize(p) : "",
    nom: reste.length ? capitalize(reste.join(" ")) : "",
  };
}

function jjmm(jour: number | string | null, mois: number | string | null): string {
  const j = jour == null ? null : Number(jour);
  const m = mois == null ? null : Number(mois);
  if (!j || !m || Number.isNaN(j) || Number.isNaN(m)) return "";
  return `${String(j).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/**
 * Valeurs de substitution pour un dossier donné.
 * `maintenant` est injectable pour garder un rendu identique serveur/client.
 */
export function buildMailVars(
  client: MailClientRow,
  dirigeant: MailDirigeant,
  utilisateurEmail: string | null,
  maintenant: Date = new Date()
): Record<string, string> {
  const moi = identiteDepuisEmail(utilisateurEmail);
  const civilite = dirigeant?.civilite ?? "";
  const nom = dirigeant?.nom ?? "";
  const civiliteLongue = CIVILITE_LONGUE[civilite] ?? "";
  const salutation = [civiliteLongue, nom].filter(Boolean).join(" ");

  return {
    denomination: client.denomination ?? "",
    siren: client.siren ?? "",
    forme: client.forme ?? "",
    activite: client.activite ?? "",
    regime: client.regime ?? "",
    adresse: client.adresse_siege ?? "",
    code_postal: client.code_postal ?? "",
    ville: client.ville ?? "",
    cloture: jjmm(client.jour_cloture, client.mois_cloture),
    salutation,
    civilite,
    prenom: dirigeant?.prenom ?? "",
    nom,
    email: dirigeant?.email ?? client.email ?? "",
    telephone: dirigeant?.telephone ?? "",
    date_du_jour: maintenant.toLocaleDateString("fr-FR"),
    annee: String(maintenant.getFullYear()),
    mon_prenom: moi.prenom,
    mon_nom: moi.nom,
    mon_email: utilisateurEmail ?? "",
  };
}

/**
 * Substitue les {variables} connues. Les inconnues sont laissées telles quelles
 * pour rester visibles dans l'aperçu (plutôt que de disparaître silencieusement).
 */
export function fillTemplate(
  texte: string,
  vars: Record<string, string>
): string {
  return texte.replace(/\{([a-z_]+)\}/g, (brut, cle: string) =>
    VARIABLE_KEYS.has(cle) ? vars[cle] ?? "" : brut
  );
}

/**
 * Variables qui sortiraient VIDES ou qui n'existent pas — signalées en rouge
 * dans l'aperçu pour éviter d'envoyer un « Bonjour , » au client.
 */
export function variablesNonResolues(
  texte: string,
  vars: Record<string, string>
): string[] {
  const trouvees = texte.match(/\{[a-z_]+\}/g) ?? [];
  const manquantes = new Set<string>();
  for (const brut of trouvees) {
    const cle = brut.slice(1, -1);
    if (!VARIABLE_KEYS.has(cle) || !(vars[cle] ?? "").trim()) manquantes.add(brut);
  }
  return [...manquantes];
}

/** Nom de fichier .eml sûr (Windows) : "DOSSIER - Nom du modèle.eml". */
export function nomFichierEml(denomination: string, nomModele: string): string {
  const nettoie = (s: string) => s.replace(/[\/\\:*?"<>|]/g, "").trim();
  const denom = nettoie(denomination) || "Dossier";
  const modele = nettoie(nomModele) || "Mail";
  return `${denom} - ${modele}.eml`;
}
