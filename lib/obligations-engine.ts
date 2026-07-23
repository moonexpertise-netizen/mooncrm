/**
 * Moteur de génération des échéances d'obligations fiscales (Phase 5).
 *
 * Pour chaque (type, exercice, clôture client), génère la liste des instances
 * d'obligations attendues, avec leur période et leur échéance.
 *
 * Fonctions pures : pas d'accès DB. Utilisé côté server action pour upsert
 * dans `obligations` (idempotent · préserve les statuts existants).
 */

import type { TypeObligation } from "@/app/clients/[slug]/actions";

export type GeneratedInstance = {
  periode: string;
  annee: number;
  echeance: string | null; // ISO YYYY-MM-DD
};

export type ClotureInfo = {
  jour_cloture: number | null;
  mois_cloture: number | null;
};

/**
 * Calcule la "date de début" couverte par une instance, pour la comparer à
 * `debut_obligations` du client. Renvoie YYYY-MM-DD ou null.
 *  · "YYYY-MM"     -> YYYY-MM-01 (mois)
 *  · "TQ-YYYY"     -> 1er jour du 1er mois du trimestre
 *  · "A-MM-YYYY"   -> YYYY-MM-15 (date d'acompte)
 *  · "S-YYYY"      -> YYYY-01-01 (solde annuel)
 *  · "YYYY"        -> YYYY-01-01
 */
function instancePeriodStart(periode: string): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const mMonth = periode.match(/^(\d{4})-(\d{2})$/);
  if (mMonth) return `${mMonth[1]}-${mMonth[2]}-01`;
  const mQ = periode.match(/^T(\d)-(\d{4})$/);
  if (mQ) {
    const q = parseInt(mQ[1], 10);
    const m = (q - 1) * 3 + 1;
    return `${mQ[2]}-${pad(m)}-01`;
  }
  const mA = periode.match(/^A-(\d{2})-(\d{4})$/);
  if (mA) return `${mA[2]}-${mA[1]}-15`;
  const mS = periode.match(/^S-(\d{4})$/);
  if (mS) return `${mS[1]}-01-01`;
  const mYear = periode.match(/^(\d{4})$/);
  if (mYear) return `${mYear[1]}-01-01`;
  return null;
}

/**
 * Filtre les instances dont la période commence avant `debut`.
 *
 * Cas particulier des obligations ANNUELLES (période = "YYYY" : liasse, AGO,
 * DAS2, IFU...) : elles portent sur l'exercice ENTIER et se déposent APRÈS sa
 * clôture. Une prise en charge en cours d'année n'exclut donc pas l'exercice
 * (reprise en juin 2026 -> on fait bien la liasse 2026, déposée en mai 2027).
 * On compare l'échéance de dépôt, pas le 1er janvier — sinon la ligne
 * d'obligation n'est jamais créée et la cellule reste bloquée sur "-".
 */
export function filterByDebut(
  instances: GeneratedInstance[],
  debut: string | null | undefined
): GeneratedInstance[] {
  if (!debut) return instances;
  return instances.filter((i) => {
    if (/^\d{4}$/.test(i.periode)) {
      return i.echeance ? i.echeance >= debut : true;
    }
    const start = instancePeriodStart(i.periode);
    if (!start) return true;
    return start >= debut;
  });
}

// ---------------------------------------------------------------------------
// Helpers de calcul de date
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * Échéance "solde" calée sur la clôture, jour = 3 (CA12) ou 18 (liasse / IS_SOLDE / CVAE).
 * Règle MOON :
 *   - clôture 31/12 -> mois éché = mai (5), année N+1   (cas particulier)
 *   - autres clôtures -> mois éché = clôture + 4 mois, ajustement année si on dépasse décembre
 */
function soldeEcheance(annee: number, moisCloture: number, jour: number): string {
  const delaiMois = moisCloture === 12 ? 5 : 4;
  const total = moisCloture - 1 + delaiMois;
  const moisEche = (total % 12) + 1;
  const yearOffset = total >= 12 ? 1 : 0;
  return iso(annee + yearOffset, moisEche, jour);
}

/**
 * Échéance AGO + dépôt : dernier jour du 6ème mois suivant la clôture.
 *   - 31/12/N -> 30/06/N+1
 *   - 30/06/N -> 31/12/N
 *   - 30/09/N -> 31/03/N+1
 */
function agoEcheance(annee: number, moisCloture: number): string {
  // JS Date : new Date(year, monthIndex, 0) -> dernier jour du mois précédent
  // On veut le dernier jour de (moisCloture + 6).
  const d = new Date(Date.UTC(annee, moisCloture - 1 + 6 + 1, 0));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// ---------------------------------------------------------------------------
// Règles par type
// ---------------------------------------------------------------------------

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const QUARTERS = [1, 2, 3, 4];

/**
 * Échéance TVA mensuelle : 24 du mois M+1.
 *   TVA mois 12 N -> 24/01/(N+1)
 */
function tvaMensuelleInstances(annee: number): GeneratedInstance[] {
  return MONTHS.map((m) => {
    const echM = m === 12 ? 1 : m + 1;
    const echY = m === 12 ? annee + 1 : annee;
    return {
      periode: `${annee}-${pad(m)}`,
      annee,
      echeance: iso(echY, echM, 24),
    };
  });
}

/**
 * Échéance TVA trimestrielle : 24 du mois suivant la fin du trimestre.
 *   T1 (J/F/M) -> 24/04 ; T4 -> 24/01 N+1
 */
function tvaTrimestrielleInstances(annee: number): GeneratedInstance[] {
  return QUARTERS.map((q) => {
    // Mois de fin de trimestre : 3, 6, 9, 12 -> échéance mois +1
    const finMois = q * 3;
    const echM = finMois === 12 ? 1 : finMois + 1;
    const echY = finMois === 12 ? annee + 1 : annee;
    return {
      periode: `T${q}-${annee}`,
      annee,
      echeance: iso(echY, echM, 24),
    };
  });
}

/**
 * Échéance TVA annuelle (CA12) :
 *   - Acompte 1 : 15/07/N (fixe)
 *   - Acompte 2 : 15/12/N (fixe)
 *   - Solde     : clôture + 3m + 3j (cf. soldeEcheance)
 */
function tvaCa12Instances(annee: number, moisCloture: number | null): GeneratedInstance[] {
  const inst: GeneratedInstance[] = [
    { periode: `A-07-${annee}`, annee, echeance: iso(annee, 7, 15) },
    { periode: `A-12-${annee}`, annee, echeance: iso(annee, 12, 15) },
  ];
  if (moisCloture) {
    inst.push({
      periode: `S-${annee}`,
      annee,
      echeance: soldeEcheance(annee, moisCloture, 3),
    });
  } else {
    inst.push({ periode: `S-${annee}`, annee, echeance: null });
  }
  return inst;
}

/**
 * TVS : 1 instance au 24/01/(N+1). Pour l'instant, échéance fixe quel que soit
 * le mode TVA (l'utilisateur a tranché : "24 janvier max").
 */
function tvsInstances(annee: number): GeneratedInstance[] {
  return [{ periode: `${annee}`, annee, echeance: iso(annee + 1, 1, 24) }];
}

/** IS acomptes : 4 dates fixes (15/03, 15/06, 15/09, 15/12) peu importe la clôture. */
function isAcompteInstances(annee: number): GeneratedInstance[] {
  return [3, 6, 9, 12].map((m) => ({
    periode: `A-${pad(m)}-${annee}`,
    annee,
    echeance: iso(annee, m, 15),
  }));
}

/** IS solde : clôture + 3m + 18j (avec exception 31/12 -> mai). */
function isSoldeInstances(annee: number, moisCloture: number | null): GeneratedInstance[] {
  return [
    {
      periode: `${annee}`,
      annee,
      echeance: moisCloture ? soldeEcheance(annee, moisCloture, 18) : null,
    },
  ];
}

/** CFE : 30/11/N (toujours). */
function cfeInstances(annee: number): GeneratedInstance[] {
  return [{ periode: `${annee}`, annee, echeance: iso(annee, 11, 30) }];
}

/** CVAE solde (1329 DEF) : même date que IS solde / liasse. */
function cvaeInstances(annee: number, moisCloture: number | null): GeneratedInstance[] {
  return [
    {
      periode: `${annee}`,
      annee,
      echeance: moisCloture ? soldeEcheance(annee, moisCloture, 18) : null,
    },
  ];
}

/** Acomptes CVAE : 15/06 et 15/09. */
function cvaeAcompteInstances(annee: number): GeneratedInstance[] {
  return [6, 9].map((m) => ({
    periode: `A-${pad(m)}-${annee}`,
    annee,
    echeance: iso(annee, m, 15),
  }));
}

/** DAS2 : 03/05/(N+1) · fonctionne par année civile. */
function das2Instances(annee: number): GeneratedInstance[] {
  return [{ periode: `${annee}`, annee, echeance: iso(annee + 1, 5, 3) }];
}

/** 2561 : 15/02/(N+1) suivant l'année de distribution. */
function decl2561Instances(annee: number): GeneratedInstance[] {
  return [{ periode: `${annee}`, annee, echeance: iso(annee + 1, 2, 15) }];
}

/** 2777 : instance créée pour le suivi, mais pas d'échéance. */
function decl2777Instances(annee: number): GeneratedInstance[] {
  return [{ periode: `${annee}`, annee, echeance: null }];
}

/** OSS : 15/04, 15/07, 15/10, 15/01 N+1. */
function ossInstances(annee: number): GeneratedInstance[] {
  return QUARTERS.map((q) => {
    const finMois = q * 3;
    const echM = finMois === 12 ? 1 : finMois + 1;
    const echY = finMois === 12 ? annee + 1 : annee;
    return {
      periode: `T${q}-${annee}`,
      annee,
      echeance: iso(echY, echM, 15),
    };
  });
}

/** DES : 12 instances, échéance 10 du mois M+1. */
function desInstances(annee: number): GeneratedInstance[] {
  return MONTHS.map((m) => {
    const echM = m === 12 ? 1 : m + 1;
    const echY = m === 12 ? annee + 1 : annee;
    return {
      periode: `${annee}-${pad(m)}`,
      annee,
      echeance: iso(echY, echM, 10),
    };
  });
}

/** Liasse / Plaquette : clôture + 3m + 18j. */
function liasseInstances(annee: number, moisCloture: number | null): GeneratedInstance[] {
  return [
    {
      periode: `${annee}`,
      annee,
      echeance: moisCloture ? soldeEcheance(annee, moisCloture, 18) : null,
    },
  ];
}

/** AGO + dépôt : 6 mois après clôture (dernier jour du 6ème mois). */
function agoDepotInstances(annee: number, moisCloture: number | null): GeneratedInstance[] {
  return [
    {
      periode: `${annee}`,
      annee,
      echeance: moisCloture ? agoEcheance(annee, moisCloture) : null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

export function generateInstancesForType(
  type: TypeObligation,
  annee: number,
  cloture: ClotureInfo
): GeneratedInstance[] {
  const moisCloture = cloture.mois_cloture;
  switch (type) {
    case "TVA_MENSUELLE":      return tvaMensuelleInstances(annee);
    case "TVA_TRIMESTRIELLE":  return tvaTrimestrielleInstances(annee);
    case "TVA_ANNUELLE_CA12":  return tvaCa12Instances(annee, moisCloture);
    case "TVA_NON_SOUMIS":     return [];
    case "TVS":                return tvsInstances(annee);
    case "IS_ACOMPTE":         return isAcompteInstances(annee);
    case "IS_SOLDE":           return isSoldeInstances(annee, moisCloture);
    case "CFE":                return cfeInstances(annee);
    case "CVAE":               return cvaeInstances(annee, moisCloture);
    case "CVAE_ACOMPTE":       return cvaeAcompteInstances(annee);
    case "DAS2":               return das2Instances(annee);
    case "DECL_2561":          return decl2561Instances(annee);
    case "DECL_2777":          return decl2777Instances(annee);
    case "OSS":                return ossInstances(annee);
    case "DES":                return desInstances(annee);
    case "LIASSE_PLAQUETTE":   return liasseInstances(annee, moisCloture);
    case "AGO_DEPOT":          return agoDepotInstances(annee, moisCloture);
    // Types présents en DB depuis Notion mais non générés par le moteur
    // (utilisateur les considère redondants / hors scope MoonCRM).
    case "COMPTA":
    case "DEPOT_COMPTES":
    case "FACTURATION_JUR":
    case "ETAT_CREATION":
      return [];
    default:
      return [];
  }
}
