/**
 * Mappe un code "nature_juridique" INSEE renvoyé par l'API annuaire-entreprises
 * vers les formes utilisées dans le CRM MOON.
 *
 * Sociétés commerciales courantes : par défaut clôture au 31/12, ce qui sert
 * aussi à pré-remplir jour_cloture / mois_cloture lors de l'import depuis
 * l'annuaire (le code INSEE seul ne contient pas la date de clôture).
 */

export type FormeJuridique =
  | "ASSO" | "SA" | "SCI" | "EI" | "SARL" | "SAS" | "SELARL" | "SELAS"
  | "SCM" | "SC" | "EURL" | "SASU" | "INDIV" | "AARPI" | "LMNP";

const NATURE_TO_FORME: Record<string, FormeJuridique> = {
  "5710": "SAS", "5720": "SAS",
  "5498": "SARL", "5499": "SARL", "5485": "SARL",
  "5499 ": "SARL",
  "5505": "EURL", "5430": "EURL",
  "5202": "SASU",
  "1000": "EI", "1100": "EI",
  "5560": "SA", "5599": "SA",
  "5410": "SELARL", "5470": "SELARL",
  "5485 ": "SELAS",
  "6540": "SCI",
  "9220": "ASSO",
};

export function formeFromNatureJuridique(
  nature: string | null | undefined
): FormeJuridique | null {
  if (!nature) return null;
  return NATURE_TO_FORME[nature] ?? null;
}

/**
 * Sociétés commerciales classiques dont la clôture par défaut est le 31/12
 * (sauf indication contraire dans le dossier client). Utilisé pour
 * pré-remplir jour_cloture / mois_cloture à l'import annuaire.
 */
const COMMERCIAL_FORMES = new Set<FormeJuridique>([
  "SAS",
  "SARL",
  "EURL",
  "SASU",
  "SA",
  "SELARL",
  "SELAS",
  "SCI",
]);

export function defaultClotureForForme(
  forme: FormeJuridique | null
): { jour: number; mois: number } | null {
  if (forme && COMMERCIAL_FORMES.has(forme)) {
    return { jour: 31, mois: 12 };
  }
  return null;
}
