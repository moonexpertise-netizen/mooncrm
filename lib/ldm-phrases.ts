/**
 * Phrases conditionnelles insérées dans la LDM.
 * Texte EXACT issu de `LDM PRESENTATION.xlsx` (Publipostage Benjamin) — formules
 * répliquées en TypeScript.
 *
 * Drapeaux explicites en DB (un dossier doit avoir une décision claire,
 * pas une déduction d'un montant à 0) :
 *   · type_honos_bilans : Inclus / Facturés / null
 *   · type_honos_jur    : Facturés / Inclus / Non souscrit / null
 *   · tdb_periode       : Mensuel / Trimestriel / Non souscrit / null
 *
 * Pour Création / Reprise : pas de flag dédié, on dérive du montant > 0
 * (un montant signifie qu'on facture).
 */

export type LDMContext = {
  type_honos_bilans: "Inclus" | "Facturés" | null;
  type_honos_jur: "Facturés" | "Inclus" | "Non souscrit" | null;
  type_honos_creation: "Facturés" | "Non souscrit" | null;
  type_honos_reprise: "Facturés" | "Non souscrit" | null;
  tdb_periode: "Mensuel" | "Trimestriel" | "Non souscrit" | null;
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
 * 2 cas selon type_honos_reprise :
 *   · "Non souscrit" / null → "Aucune reprise à facturer."
 *   · "Facturés"            → "(...) sera facturée X € HT."
 */
export function phraseReprise(ctx: LDMContext): string {
  if (ctx.type_honos_reprise !== "Facturés" || ctx.honoraires_reprise <= 0) {
    return "Aucune reprise à facturer.";
  }
  return `La reprise comptable et fiscale des périodes antérieures sera facturée ${eur(ctx.honoraires_reprise)} € HT.`;
}

/**
 * 3 cas selon type_honos_jur :
 *   · "Non souscrit" / null → phrase vide (rien de juridique)
 *   · "Inclus"             → "Les travaux juridiques annuels (...) sont inclus."
 *   · "Facturés"           → "(...) seront facturés X € HT hors frais de greffe."
 */
export function phraseJuridique(ctx: LDMContext): string {
  if (ctx.type_honos_jur === "Non souscrit" || ctx.type_honos_jur === null) return "";
  if (ctx.type_honos_jur === "Inclus") {
    return "Les travaux juridiques annuels (AGO + Dépôt des comptes au greffe) sont inclus.";
  }
  // Facturés : on a besoin d'un montant > 0
  if (ctx.honoraires_jur <= 0) return "";
  return `Les travaux juridiques annuels (AGO + Dépôt des comptes au greffe) seront facturés ${eur(ctx.honoraires_jur)} € HT hors frais de greffe, chaque année.`;
}

/**
 * Excel :
 *   IF(TDB = "" OR "N/A", "Pas de souscription.",
 *      "Souscription du forfait pilotage, avec présentation d'un tableau de bord "
 *       & LOWER(TDB) & ". Chaque période sera facturée " & TDB_honos_periode & " € HT.")
 *
 * tdb_periode = null OU "Non souscrit" → "Pas de souscription."
 */
export function phraseTdb(ctx: LDMContext): string {
  if (ctx.tdb_periode === null || ctx.tdb_periode === "Non souscrit") {
    return "Pas de souscription.";
  }
  const periodeLower = ctx.tdb_periode.toLowerCase(); // "mensuel" | "trimestriel"
  return `Souscription du forfait pilotage, avec présentation d'un tableau de bord ${periodeLower}. Chaque période sera facturée ${eur(ctx.tdb_honos_periode)} € HT.`;
}

/**
 * 2 cas selon type_honos_creation :
 *   · "Non souscrit" / null → "" (phrase vide)
 *   · "Facturés"            → "(...) sera facturée X € HT, hors frais de greffe."
 */
export function phraseHonosCreation(ctx: LDMContext): string {
  if (ctx.type_honos_creation !== "Facturés" || ctx.honoraires_creation <= 0) return "";
  return `La création de la société sera facturée ${eur(ctx.honoraires_creation)} € HT, hors frais de greffe.`;
}
