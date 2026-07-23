/**
 * Phrases conditionnelles insérées dans la LDM.
 * Texte EXACT issu de `LDM PRESENTATION.xlsx` (Publipostage Benjamin) - formules
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
  oss_periode: "Trimestriel" | "Non souscrit" | null;  // Guichet unique - OSS
  oss_honos_trimestre: number;    // montant par trimestre (saisi)
  forfait_bilan: number;          // annuel (saisi)
  honoraires_jur: number;         // annuel
  honoraires_reprise: number;     // one-shot
  honoraires_creation: number;    // one-shot
  forfait_pilotage: number;       // mensuel (calculé)
  honos_mensuels: number;         // = compta + pilotage (mensuel)
  // Forfait de début d'activité (tarif réduit 1ère année). Impact LDM seul.
  forfait_debut_montant: number;
  forfait_debut_date_debut: string | null;   // YYYY-MM-DD
  forfait_debut_condition: "Début de facturation" | "Nombre de mois" | "Date" | null;
  forfait_debut_nb_mois: number | null;
  forfait_debut_nb_echeances: number | null;  // borne "(N échéances maximum)" si condition = Début de facturation
  forfait_debut_date_fin: string | null;      // YYYY-MM-DD
  forfait_debut_termine: boolean;
  bilan_premier_offert: boolean;              // 1er bilan offert
};

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n));

/** YYYY-MM-DD -> DD/MM/YYYY (pour la LDM). Renvoie "" si null/invalide. */
function fmtDateFr(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Forfait de début d'activité : phrase ajoutée à la fin du bullet conformité.
 * Actif = montant > 0 ET condition définie ET pas encore terminé.
 *   · "à compter du {date}" si date de début renseignée
 *   · fin selon la condition : jusqu'au {date_fin} | pendant {N} mois |
 *     jusqu'au début de votre facturation
 */
export function phraseForfaitDebut(ctx: LDMContext): string {
  if (ctx.forfait_debut_montant <= 0 || !ctx.forfait_debut_condition || ctx.forfait_debut_termine) {
    return "";
  }
  const debut = fmtDateFr(ctx.forfait_debut_date_debut);
  const start = debut ? ` à compter du ${debut}` : "";
  let end = "";
  if (ctx.forfait_debut_condition === "Date") {
    const fin = fmtDateFr(ctx.forfait_debut_date_fin);
    end = fin ? ` et jusqu'au ${fin}` : "";
  } else if (ctx.forfait_debut_condition === "Nombre de mois" && ctx.forfait_debut_nb_mois) {
    end = `, pendant ${ctx.forfait_debut_nb_mois} mois`;
  } else if (ctx.forfait_debut_condition === "Début de facturation") {
    end = " et jusqu'au début de votre facturation";
    const nb = ctx.forfait_debut_nb_echeances;
    if (nb != null && nb > 0) {
      end += ` (${nb} échéance${nb > 1 ? "s" : ""} maximum)`;
    }
  }
  return ` À titre exceptionnel, les honoraires sont ramenés à ${eur(ctx.forfait_debut_montant)} € HT/mois${start}${end}.`;
}

/**
 * Bullet "Forfait conformité (comptabilité et fiscalité)" - toujours présent.
 *   ${compta_mois} € HT par mois à traiter, soit ${compta_an} € HT pour une année de 12 mois.
 */
export function phraseConformite(compta: number, ctx?: LDMContext): string {
  const an = compta * 12;
  const base = `${eur(compta)} € HT par mois à traiter, soit ${eur(an)} € HT pour une année de 12 mois.`;
  // Forfait de début d'activité éventuel (ajouté à la fin du bullet).
  return ctx ? base + phraseForfaitDebut(ctx) : base;
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
  const offert = ctx.bilan_premier_offert
    ? " À titre exceptionnel, le premier bilan est offert !"
    : "";
  return `Les travaux de bilans seront facturés ${eur(ctx.forfait_bilan)} € HT chaque année.${offert}`;
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
 * Guichet unique - OSS (toujours trimestriel). Calqué sur phraseTdb.
 *   · oss_periode = null OU "Non souscrit" → "Non souscrit."
 *   · "Trimestriel" → phrase de souscription avec montant par trimestre.
 */
export function phraseOss(ctx: LDMContext): string {
  if (ctx.oss_periode !== "Trimestriel" || ctx.oss_honos_trimestre <= 0) {
    return "Non souscrit.";
  }
  return `Souscription du forfait de gestion du guichet unique (OSS), avec déclarations trimestrielles. Chaque déclaration trimestrielle sera facturée ${eur(ctx.oss_honos_trimestre)} € HT.`;
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
