/**
 * Calcul des dates d'activation (orange) et d'echeance (rouge) pour chaque
 * type d'obligation. Permet d'afficher des pastilles d'urgence intelligentes
 * (au lieu d'une pastille rouge partout des qu'une obligation est A_FAIRE).
 *
 * Regle generale : "actif des que la periode est terminee" (logique metier
 * cabinet). Pas de seuil 30j arbitraire - c'est le 1er du mois suivant qui
 * declenche l'obligation de s'en occuper.
 *
 * Voir le tableau dans la conversation : chaque type a une regle precise
 * negociee avec Benjamin (cf. CLAUDE.md / discussions du 03/06/2026).
 */

/** Statut d'urgence visuel pour une cellule d'obligation. */
export type UrgencyStatus =
  | "none"      // Pas d'urgence : statut Terminé OU periode pas encore active
  | "due_soon"  // 🟠 Orange : actif, a traiter
  | "overdue";  // 🔴 Rouge : echeance depassee + pas terminé

/** Clôture du client (jour + mois). Ex. 31/12 = {jour: 31, mois: 12}. */
export type ClotureClient = {
  jour: number; // 1-31
  mois: number; // 1-12
};

/** Resultat du calcul d'echeance pour une cellule. */
export type EcheanceInfo = {
  /** Date a partir de laquelle la cellule devient "active" (orange). */
  activeFrom: Date;
  /** Date d'echeance (apres -> rouge si pas terminé). */
  dueDate: Date;
};

// ============================================================================
//  Helpers de date
// ============================================================================
//
// IMPORTANT : on travaille en UTC partout. En heure locale (Europe/Paris),
// `new Date(2026, 5, 30)` donne 30/06/2026 00:00 local, mais `.toISOString()`
// le convertit en UTC -> "2026-06-29T22:00:00Z", la string substr(0,10) vaut
// alors "2026-06-29" -> 1 jour de retard a l'affichage. Tout passer en UTC
// elimine ce decalage.

/** Cree une date "1er du mois donne" (mois 1-12, year 4 chiffres) en UTC. */
function firstOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Cree une date YYYY-MM-DD propre en UTC (composantes 1-based pour le mois). */
function makeDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Renvoie le nombre de jours dans un mois donne (mois 1-12). */
function lastDayOfMonth(year: number, month: number): number {
  // Date.UTC(year, month, 0) = dernier jour du mois precedent (= dernier jour
  // du mois `month` en notation 1-based).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Ajoute N mois a une date UTC (clamp jour au dernier du mois si depassement). */
function addMonths(d: Date, n: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-11
  const day = d.getUTCDate();
  const targetMonthIdx = month + n;
  const targetYear = year + Math.floor(targetMonthIdx / 12);
  const targetMonth = ((targetMonthIdx % 12) + 12) % 12; // 0-11
  const targetDay = Math.min(day, lastDayOfMonth(targetYear, targetMonth + 1));
  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

/**
 * Ajoute N mois EN PRESERVANT la "fin de mois" : si la date source est le
 * dernier jour de son mois, le resultat sera le dernier jour du mois cible
 * (peu importe que ce soit 28, 30 ou 31). Sinon, comportement classique.
 *
 *   31/12 + 6m -> 30/06 (juin n'a que 30 jours, mais c'est bien fin de mois)
 *   31/01 + 6m -> 31/07
 *   28/02 + 6m -> 31/08 (fevrier = fin de mois -> ajustement)
 *   15/03 + 6m -> 15/09 (jour normal -> identique)
 */
function addMonthsEndOfMonth(d: Date, n: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-11
  const day = d.getUTCDate();
  const targetMonthIdx = month + n;
  const targetYear = year + Math.floor(targetMonthIdx / 12);
  const targetMonth = ((targetMonthIdx % 12) + 12) % 12; // 0-11
  const isLastDay = day === lastDayOfMonth(year, month + 1);
  const targetDay = isLastDay
    ? lastDayOfMonth(targetYear, targetMonth + 1)
    : Math.min(day, lastDayOfMonth(targetYear, targetMonth + 1));
  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

/** Ajoute N jours a une date UTC. */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Extrait la premiere annee 4 chiffres d'une string de periode quelconque. */
export function extractAnneeFromPeriode(periode: string): number | null {
  const m = periode.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

/** Renvoie true si la clôture est l'annee civile (31/12). */
function isAnneeCivile(cloture: ClotureClient): boolean {
  return cloture.jour === 31 && cloture.mois === 12;
}

/** Parse une "periode" : "2026-04" -> {year: 2026, month: 4}, "2026" -> {year: 2026}. */
function parsePeriode(periode: string): { year: number; month?: number } {
  const m = periode.match(/^(\d{4})(?:-(\d{2}))?$/);
  if (!m) {
    // Fallback : "T1-2026" etc.
    const tm = periode.match(/^T(\d)-(\d{4})$/);
    if (tm) {
      const trim = parseInt(tm[1], 10);
      const year = parseInt(tm[2], 10);
      // Mois du dernier mois du trimestre : T1=mars, T2=juin, T3=sept, T4=dec
      return { year, month: trim * 3 };
    }
    return { year: new Date().getFullYear() };
  }
  return {
    year: parseInt(m[1], 10),
    month: m[2] ? parseInt(m[2], 10) : undefined,
  };
}

// ============================================================================
//  Regles d'echeance par type d'obligation
// ============================================================================

/**
 * Calcule (activeFrom, dueDate) pour une obligation donnee.
 *
 * @param type Code du type d'obligation (TVA_MENSUELLE, IS_SOLDE, etc.)
 * @param periode Chaine "YYYY-MM" pour TVA, "T1-YYYY" pour trim, "YYYY" pour annuel
 * @param annee Annee de l'exercice (utile pour les obligations annuelles)
 * @param cloture Clôture du client (defaut 31/12 si non fournie)
 */
export function computeEcheance(
  type: string,
  periode: string,
  annee: number,
  cloture: ClotureClient = { jour: 31, mois: 12 }
): EcheanceInfo | null {
  const p = parsePeriode(periode);

  // ----- TVA mensuelle -----
  // Actif 1er du mois M+1, echeance 24 du mois M+1
  if (type === "TVA_MENSUELLE" || type === "TVS_MENSUELLE") {
    if (!p.month) return null;
    // Periode "2026-04" -> activation 1er mai 2026, echeance 24 mai 2026
    const nextMonth = p.month === 12 ? 1 : p.month + 1;
    const nextYear = p.month === 12 ? p.year + 1 : p.year;
    return {
      activeFrom: firstOfMonth(nextYear, nextMonth),
      dueDate: makeDate(nextYear, nextMonth, 24),
    };
  }

  // ----- TVA trimestrielle -----
  // Periode "T1-2026" -> activation 1er avril, echeance 24 avril
  if (type === "TVA_TRIMESTRIELLE" || type === "TVS_TRIMESTRIELLE") {
    if (!p.month) return null;
    // p.month est le dernier mois du trimestre. Activation = mois suivant.
    const nextMonth = p.month === 12 ? 1 : p.month + 1;
    const nextYear = p.month === 12 ? p.year + 1 : p.year;
    return {
      activeFrom: firstOfMonth(nextYear, nextMonth),
      dueDate: makeDate(nextYear, nextMonth, 24),
    };
  }

  // ----- TVA annuelle CA12 (regime reel simplifie) -----
  // 3 sortes de cellules avec des formats de periode distincts :
  //   A-07-YYYY : acompte 1 -> echeance 15/07/YYYY, active depuis 1er juillet
  //   A-12-YYYY : acompte 2 -> echeance 15/12/YYYY, active depuis 1er decembre
  //   S-YYYY    : solde (regle cloture + 3m + 3j) -> identique a IS_SOLDE
  if (type === "TVA_ANNUELLE_CA12") {
    const acompteMatch = periode.match(/^A-(\d{2})-(\d{4})$/);
    if (acompteMatch) {
      const m = parseInt(acompteMatch[1], 10);
      const y = parseInt(acompteMatch[2], 10);
      return {
        activeFrom: firstOfMonth(y, m),
        dueDate: makeDate(y, m, 15),
      };
    }
    const soldeMatch = periode.match(/^S-(\d{4})$/);
    const soldeYear = soldeMatch ? parseInt(soldeMatch[1], 10) : annee;
    const cloDate = makeDate(soldeYear, cloture.mois, cloture.jour);
    if (isAnneeCivile(cloture)) {
      return {
        activeFrom: firstOfMonth(soldeYear + 1, 1),
        dueDate: makeDate(soldeYear + 1, 5, 3),
      };
    }
    const activeMonth = cloture.mois === 12 ? 1 : cloture.mois + 1;
    const activeYear = cloture.mois === 12 ? soldeYear + 1 : soldeYear;
    return {
      activeFrom: firstOfMonth(activeYear, activeMonth),
      dueDate: addDays(addMonths(cloDate, 3), 3),
    };
  }

  // ----- IS annuel / solde IS -----
  // Clôture 31/12 : actif 1er janvier N+1, echeance 18 mai N+1
  // Clôture décalée : actif 1er du mois suivant clôture, echeance clôture + 3m + 18j
  if (type === "IS_SOLDE" || type === "LIASSE_PLAQUETTE" || type === "COMPTA") {
    // L'exercice clos en `annee` (cloture jj/mm/annee) genere une echeance N+1
    const cloDate = makeDate(annee, cloture.mois, cloture.jour);
    if (isAnneeCivile(cloture)) {
      return {
        activeFrom: firstOfMonth(annee + 1, 1),
        dueDate: makeDate(annee + 1, 5, 18),
      };
    }
    // Décalée : 1er du mois suivant clôture, +3m +18j
    const activeMonth = cloture.mois === 12 ? 1 : cloture.mois + 1;
    const activeYear = cloture.mois === 12 ? annee + 1 : annee;
    return {
      activeFrom: firstOfMonth(activeYear, activeMonth),
      dueDate: addDays(addMonths(cloDate, 3), 18),
    };
  }

  // ----- Acomptes IS -----
  // Activation 1er du mois de l'echeance (ex. 15 juin -> 1er juin)
  // Les acomptes sont generalement 15/03, 15/06, 15/09, 15/12.
  // periode = "YYYY-MM" pour les acomptes ? Ou "YYYY" + un detail ?
  if (type === "IS_ACOMPTE" || type === "CVAE_ACOMPTE") {
    if (p.month) {
      return {
        activeFrom: firstOfMonth(p.year, p.month),
        dueDate: makeDate(p.year, p.month, 15),
      };
    }
    // Pas de mois -> on ne sait pas, fallback null
    return null;
  }

  // ----- AGO / Dépôt comptes -----
  // AGO : clôture + 6 mois ; Dépôt : clôture + 7 mois.
  // Regle "fin de mois" : si la cloture est le dernier jour de son mois,
  // l'echeance reste le dernier jour du mois cible (31/12 -> 30/06 fin juin,
  // 31/01 -> 31/07 fin juillet, 28/02 -> 31/08 fin aout).
  if (type === "AGO_DEPOT" || type === "DEPOT_COMPTES") {
    const cloDate = makeDate(annee, cloture.mois, cloture.jour);
    const monthsToAdd = type === "AGO_DEPOT" ? 6 : 7;
    if (isAnneeCivile(cloture)) {
      return {
        activeFrom: firstOfMonth(annee + 1, 1),
        dueDate: addMonthsEndOfMonth(cloDate, monthsToAdd),
      };
    }
    const activeMonth = cloture.mois === 12 ? 1 : cloture.mois + 1;
    const activeYear = cloture.mois === 12 ? annee + 1 : annee;
    return {
      activeFrom: firstOfMonth(activeYear, activeMonth),
      dueDate: addMonthsEndOfMonth(cloDate, monthsToAdd),
    };
  }

  // ----- DAS2 / CVAE annuel (annee civile) -----
  // Actif 1er janvier N+1, echeance 18 mai N+1
  if (type === "DAS2" || type === "CVAE") {
    return {
      activeFrom: firstOfMonth(annee + 1, 1),
      dueDate: makeDate(annee + 1, 5, 18),
    };
  }

  // (CFE retiree : type inutilise par MOON Expertise)

  // Pas de regle d'echeance pour ce type -> pas d'urgence calculee
  return null;
}

/**
 * Pour les obligations IR (declaration revenus particulier) :
 * Actif 1er janvier N+1, echeance 31 mai N+1.
 * @param annee Annee fiscale (revenus de l'annee N)
 */
export function computeEcheanceIR(annee: number): EcheanceInfo {
  return {
    activeFrom: firstOfMonth(annee + 1, 1),
    dueDate: makeDate(annee + 1, 5, 31),
  };
}

/**
 * Pour Pilotage TdB / RDV expert : actif 1er du mois M+1, echeance 15 M+1.
 * @param periode "YYYY-MM"
 */
export function computeEcheancePilotage(periode: string): EcheanceInfo | null {
  const p = parsePeriode(periode);
  if (!p.month) return null;
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  return {
    activeFrom: firstOfMonth(nextYear, nextMonth),
    dueDate: makeDate(nextYear, nextMonth, 15),
  };
}

// ============================================================================
//  Calcul du statut d'urgence
// ============================================================================

/**
 * Determine le niveau d'urgence d'une cellule a partir de :
 *   - son info d'echeance (activeFrom, dueDate)
 *   - son statut logique actuel (A_FAIRE / EN_COURS / TERMINE / NA)
 *   - la date courante
 *
 * Logique :
 *   - Si TERMINE ou NON_APPLICABLE -> none (rien a signaler)
 *   - Si today < activeFrom -> none (pas encore actif)
 *   - Si today > dueDate -> overdue (rouge, en retard)
 *   - Sinon -> due_soon (orange, a traiter)
 */
export function getUrgencyStatus(
  echeance: EcheanceInfo | null,
  statutLogique: string | null | undefined,
  today: Date = new Date()
): UrgencyStatus {
  // Statut termine ou N/A -> aucune urgence
  if (statutLogique === "TERMINE" || statutLogique === "NON_APPLICABLE") {
    return "none";
  }
  // Pas d'echeance calculable -> on ne signale rien
  if (!echeance) return "none";

  const t = today.getTime();
  if (t < echeance.activeFrom.getTime()) return "none";
  if (t > echeance.dueDate.getTime()) return "overdue";
  return "due_soon";
}

/** Helper compact : combine compute + getUrgencyStatus. */
export function getObligationUrgency(
  type: string,
  periode: string,
  annee: number,
  cloture: ClotureClient | undefined,
  statutLogique: string | null | undefined,
  today: Date = new Date()
): UrgencyStatus {
  const echeance = computeEcheance(type, periode, annee, cloture);
  return getUrgencyStatus(echeance, statutLogique, today);
}
