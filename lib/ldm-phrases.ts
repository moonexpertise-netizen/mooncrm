/**
 * Phrases conditionnelles insérées dans la LDM.
 * Texte EXACT issu de `LDM PRESENTATION.xlsx` (Publipostage Benjamin) — formules
 * répliquées en TypeScript.
 *
 * Limitations connues (à brancher si besoin) :
 *   · phraseHonosBilan : Excel a un flag "Type honos bilans ?" (Inclus / Facturés).
 *     Ici on déduit "Inclus" = forfait_bilan == 0 et "Facturés" = > 0.
 *   · phraseTdb : Excel a un flag "Tableau de bord ?" (Mensuel / Trimestriel / N/A)
 *     + un montant "TDB honos période". On utilise forfait_pilotage en mensuel
 *     par défaut. Pour la version trimestrielle, ajouter une colonne `tdb_periode`.
 */

export type LDMContext = {
  type_honos_bilans: "Inclus" | "Facturés" | null;
  tdb_periode: "Mensuel" | "Trimestriel" | null;
  tdb_honos_periode: number;      // montant par période
  honoraires_jur: number;         // annuel
  honoraires_reprise: number;     // one-shot
  honoraires_creation: number;    // one-shot
  forfait_pilotage: number;       // mensuel (calculé)
  honos_mensuels: number;         // = compta + pilotage (mensuel)
};

const eur = (n: number) => Math.round(n).toString();

/**
 * Excel :
 *   IF(Type_honos_bilans = "" , "",
 *      IF(Type_honos_bilans = "Inclus", "Les travaux de bilans sont inclus.",
 *         "Les travaux de bilans seront facturés " & (Honos_mensuels*2) & " € HT chaque année."))
 */
export function phraseHonosBilan(ctx: LDMContext): string {
  if (ctx.type_honos_bilans === null) return "";
  if (ctx.type_honos_bilans === "Inclus") return "Les travaux de bilans sont inclus.";
  const montant = ctx.honos_mensuels * 2;
  return `Les travaux de bilans seront facturés ${eur(montant)} € HT chaque année.`;
}

/**
 * Excel :
 *   IF(Reprise_regul = "" OR "Non", "Aucune reprise à facturer.",
 *      "La reprise comptable et fiscale des périodes antérieures sera facturée " & Honos_reprise & " € HT.")
 *
 * On utilise honoraires_reprise > 0 comme trigger.
 */
export function phraseReprise(ctx: LDMContext): string {
  if (ctx.honoraires_reprise <= 0) {
    return "Aucune reprise à facturer.";
  }
  return `La reprise comptable et fiscale des périodes antérieures sera facturée ${eur(ctx.honoraires_reprise)} € HT.`;
}

/**
 * Excel :
 *   IF(Juridique_annuel = "" OR "Non", "",
 *      "Les travaux juridiques annuels (AGO + Dépôt des comptes au greffe) seront
 *       facturés " & Honos_juridiques & " € HT hors frais de greffe, chaque année.")
 */
export function phraseJuridique(ctx: LDMContext): string {
  if (ctx.honoraires_jur <= 0) return "";
  return `Les travaux juridiques annuels (AGO + Dépôt des comptes au greffe) seront facturés ${eur(ctx.honoraires_jur)} € HT hors frais de greffe, chaque année.`;
}

/**
 * Excel :
 *   IF(TDB = "" OR "N/A", "Pas de souscription.",
 *      "Souscription du forfait pilotage, avec présentation d'un tableau de bord "
 *       & LOWER(TDB) & ". Chaque période sera facturée " & TDB_honos_periode & " € HT.")
 */
export function phraseTdb(ctx: LDMContext): string {
  if (ctx.tdb_periode === null) {
    return "Pas de souscription.";
  }
  const periodeLower = ctx.tdb_periode.toLowerCase(); // "mensuel" | "trimestriel"
  return `Souscription du forfait pilotage, avec présentation d'un tableau de bord ${periodeLower}. Chaque période sera facturée ${eur(ctx.tdb_honos_periode)} € HT.`;
}

/**
 * Excel :
 *   IF(Création = "" OR "Non", "",
 *      "La création de la société sera facturée " & Honoraires_création & " € HT, hors frais de greffe.")
 */
export function phraseHonosCreation(ctx: LDMContext): string {
  if (ctx.honoraires_creation <= 0) return "";
  return `La création de la société sera facturée ${eur(ctx.honoraires_creation)} € HT, hors frais de greffe.`;
}
