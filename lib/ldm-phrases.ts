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
  forfait_bilan: number;          // annuel (saisi)
  honoraires_jur: number;         // annuel
  honoraires_reprise: number;     // one-shot
  honoraires_creation: number;    // one-shot
  forfait_pilotage: number;       // mensuel (calculé)
  honos_mensuels: number;         // = compta + pilotage (mensuel)
};

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * Bullet "Forfait conformité (comptabilité et fiscalité)" — toujours présent.
 *   ${compta_mois} € HT par mois à traiter, soit ${compta_an} € HT pour une année de 12 mois.
 */
export function phraseConformite(compta: number): string {
  const an = compta * 12;
  return `${eur(compta)} € HT par mois à traiter, soit ${eur(an)} € HT pour une année de 12 mois.`;
}

/**
 * Excel :
 *   IF(Type_honos_bilans = "" , "",
 *      IF(Type_honos_bilans = "Inclus", "Les travaux de bilans sont inclus.",
 *         "Les travaux de bilans seront facturés " & (Honos_mensuels*2) & " € HT chaque année."))
 */
export function phraseHonosBilan(ctx: LDMContext): string {
  if (ctx.type_honos_bilans === null) return "";
  if (ctx.type_honos_bilans === "Inclus") return "Les travaux de bilans sont inclus.";
  // Facturés : on utilise le montant saisi directement (et non plus la formule
  // honos_mensuels × 2 qui ne reflétait pas la saisie utilisateur).
  if (ctx.forfait_bilan <= 0) return "";
  return `Les travaux de bilans seront facturés ${eur(ctx.forfait_bilan)} € HT chaque année.`;
}

/**
 * 2 cas selon type_honos_reprise :
 *   · "Non souscrit" / null → "Aucun travail de reprise à facturer."
 *   · "Facturés"            → "Les travaux de reprise seront facturés X € HT."
 */
export function phraseReprise(ctx: LDMContext): string {
  if (ctx.type_honos_reprise !== "Facturés" || ctx.honoraires_reprise <= 0) {
    return "Aucun travail de reprise à facturer.";
  }
  return `Les travaux de reprise seront facturés ${eur(ctx.honoraires_reprise)} € HT.`;
}

/**
 * 3 cas selon type_honos_jur :
 *   · "Non souscrit" / null → "Non souscrit"
 *   · "Inclus"             → "(...) sont inclus au forfait, hors frais de greffe, chaque année."
 *   · "Facturés"           → "(...) seront facturés X € HT hors frais de greffe, chaque année."
 */
export function phraseJuridique(ctx: LDMContext): string {
  if (ctx.type_honos_jur === "Non souscrit" || ctx.type_honos_jur === null) {
    return "Non souscrit.";
  }
  if (ctx.type_honos_jur === "Inclus") {
    return "Les travaux juridiques annuels (AGO + Dépôt des comptes au greffe) sont inclus au forfait, hors frais de greffe, chaque année.";
  }
  // Facturés : on a besoin d'un montant > 0
  if (ctx.honoraires_jur <= 0) return "Non souscrit.";
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
    return "Non souscrit.";
  }
  const periodeLower = ctx.tdb_periode.toLowerCase(); // "mensuel" | "trimestriel"
  return `Souscription du forfait pilotage, avec présentation d'un tableau de bord ${periodeLower}. Chaque période de restitution sera facturée ${eur(ctx.tdb_honos_periode)} € HT.`;
}

/**
 * 2 cas selon type_honos_creation :
 *   · "Non souscrit" / null → "Aucune création à facturer."
 *   · "Facturés"            → "La création de la société sera facturée X € HT, hors frais de greffe."
 */
export function phraseHonosCreation(ctx: LDMContext): string {
  if (ctx.type_honos_creation !== "Facturés" || ctx.honoraires_creation <= 0) {
    return "Aucune création à facturer.";
  }
  return `La création de la société sera facturée ${eur(ctx.honoraires_creation)} € HT, hors frais de greffe.`;
}
