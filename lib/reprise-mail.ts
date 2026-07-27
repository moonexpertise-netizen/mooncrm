/**
 * Mail de reprise adressé au CONFRÈRE sortant, ouvert DIRECTEMENT dans Outlook
 * (lien mailto) au moment de générer la lettre de reprise déontologique.
 *
 * Le texte n'est plus figé dans le code : c'est le modèle système
 * `mail_reprise` de /parametrage/emails (table email_templates, migration
 * 0094), avec repli sur DEFAULT_EMAIL_TEMPLATES. Ce module calcule les
 * variables propres à la reprise (civilité du confrère, nom de famille de
 * l'expert, exercices déduits de la clôture) puis les substitue.
 *
 * Contrainte à connaître : un mailto transite par l'URL, plafonnée autour de
 * 2000 caractères sous Windows/Outlook. Le modèle par défaut produit ~1465
 * caractères encodés — cf. `longueurMailto` pour alerter si un modèle
 * retouché venait à déborder.
 */

import {
  DEFAULT_EMAIL_TEMPLATES,
  type EmailTemplate,
} from "@/lib/email-templates-defaults";

export type RepriseMailInput = {
  /** Dénomination du dossier repris. */
  denomination: string;
  /** "Confrère" | "Consœur" — pilote le Monsieur / Madame d'ouverture. */
  interlocuteur: "Confrère" | "Consœur";
  /** Nom saisi de l'expert-comptable sortant, ex. "Paul DURAND". */
  expert: string;
  /** Clôture de l'exercice repris (ISO YYYY-MM-DD). */
  cloture: string;
  /** Début de la mission MOON (ISO). */
  dateDebut: string;
  /** Reprise effective des travaux (ISO). */
  dateReprise: string;
  /** Personne à qui le confrère doit envoyer les pièces ("Prénom NOM"). */
  destinatairePieces: string;
};

/** Catalogue des variables du modèle, affiché dans /parametrage/emails. */
export const REPRISE_VARIABLES: { cle: string; libelle: string }[] = [
  { cle: "civilite_confrere", libelle: "Monsieur / Madame, selon Confrère ou Consœur" },
  { cle: "nom_expert", libelle: "Nom de famille de l'expert-comptable sortant" },
  { cle: "denomination", libelle: "Nom du dossier repris" },
  { cle: "date_debut", libelle: "Date de début de mission" },
  { cle: "date_reprise", libelle: "Date de reprise des travaux" },
  { cle: "destinataire_pieces", libelle: "Personne à qui envoyer les pièces" },
  { cle: "cloture", libelle: "Date de clôture de l'exercice repris (31/12/2025)" },
  { cle: "exercices", libelle: "Les 3 exercices demandés (2025, 2024, 2023)" },
  { cle: "exercice_n", libelle: "Exercice repris (2025)" },
];

const CLES = new Set(REPRISE_VARIABLES.map((v) => v.cle));

/** ISO YYYY-MM-DD -> JJ/MM/AAAA. Renvoie la valeur telle quelle si non ISO. */
function fr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Année d'une date ISO, ou null. */
function annee(iso: string): number | null {
  const m = iso.match(/^(\d{4})-/);
  return m ? Number(m[1]) : null;
}

/**
 * Nom de famille de l'expert : les tokens en MAJUSCULES si l'annuaire a
 * pré-rempli "Prénom NOM", sinon le dernier mot saisi. On veut « Monsieur
 * DURAND », pas « Monsieur Paul DURAND ».
 */
export function nomDeFamille(expert: string): string {
  const tokens = expert.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const majuscules = tokens.filter((t) => t.length > 1 && t === t.toLocaleUpperCase("fr-FR"));
  return majuscules.length > 0 ? majuscules.join(" ") : tokens[tokens.length - 1];
}

/** Valeurs de substitution du modèle de reprise. */
export function buildRepriseVars(input: RepriseMailInput): Record<string, string> {
  const n = annee(input.cloture);
  return {
    civilite_confrere: input.interlocuteur === "Consœur" ? "Madame" : "Monsieur",
    nom_expert: nomDeFamille(input.expert),
    denomination: input.denomination,
    date_debut: fr(input.dateDebut),
    date_reprise: fr(input.dateReprise),
    destinataire_pieces: input.destinatairePieces,
    cloture: fr(input.cloture),
    // Exercices demandés : N (celui repris), N-1, N-2. Sans clôture valide on
    // laisse les repères N/N-1/N-2, à compléter à la main.
    exercices: n ? `${n}, ${n - 1}, ${n - 2}` : "N, N-1, N-2",
    exercice_n: n ? String(n) : "N",
  };
}

/** Substitue les {variables} connues ; les inconnues restent visibles. */
export function fillReprise(texte: string, vars: Record<string, string>): string {
  return texte.replace(/\{([a-z_]+)\}/g, (brut, cle: string) =>
    CLES.has(cle) ? vars[cle] ?? "" : brut
  );
}

/**
 * Objet + corps prêts à partir, à partir du modèle paramétré (ou du défaut).
 */
export function buildRepriseMail(
  input: RepriseMailInput,
  modele?: EmailTemplate | null
): { subject: string; body: string } {
  const tpl = modele ?? DEFAULT_EMAIL_TEMPLATES.mail_reprise;
  const vars = buildRepriseVars(input);
  return {
    subject: fillReprise(tpl.subject, vars),
    body: fillReprise(tpl.body, vars),
  };
}

/** Construit le lien mailto ouvrant le brouillon dans Outlook. */
export function lienMailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

/**
 * Limite pratique d'un mailto sous Windows/Outlook. Au-delà, le corps est
 * silencieusement tronqué : l'éditeur de /parametrage/emails s'en sert pour
 * alerter AVANT que le mail parte amputé.
 */
export const MAILTO_LIMITE = 2000;

/** Longueur encodée du mailto qui serait produit — pour l'alerte de longueur. */
export function longueurMailto(subject: string, body: string): number {
  return lienMailto("prenom.nom@cabinet-exemple.fr", subject, body).length;
}
