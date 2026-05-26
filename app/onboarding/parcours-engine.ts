/**
 * Moteur d'évaluation des conditions d'un parcours d'onboarding.
 *
 * Une condition stockée dans `onboarding_etape.conditions_na` détermine si
 * une étape doit être créée en NON_APPLICABLE plutôt qu'en A_FAIRE pour un
 * client donné. Les conditions sont évaluées en OR : si au moins une matche
 * le client, l'étape est N/A.
 *
 * Champs supportés (extraits du client) :
 *   - origine     : string | null   ex "1 - Création"
 *   - gestion_tns : boolean | null
 *   - forme       : string | null   ex "SAS"
 *   - activite    : string | null   ex "STARTUP"
 *
 * Opérateurs supportés :
 *   - eq      : valeur === condition.value
 *   - neq     : valeur !== condition.value
 *   - in      : condition.value (array) inclut valeur
 *   - not_in  : condition.value (array) n'inclut pas valeur
 *
 * Toute condition mal formée est ignorée (silencieusement) pour ne pas
 * casser la création d'onboarding sur une donnée corrompue.
 */

export type ConditionField = "origine" | "gestion_tns" | "forme" | "activite";
export type ConditionOp = "eq" | "neq" | "in" | "not_in";

export type ConditionNa = {
  field: ConditionField;
  op: ConditionOp;
  value: string | boolean | string[];
  reason?: string;
};

export type ClientContext = {
  origine: string | null;
  gestion_tns: boolean | null;
  forme: string | null;
  activite: string | null;
};

/**
 * Évalue une liste de conditions de N/A contre un client.
 * Retourne la première condition qui matche (ou null si aucune).
 * Le `reason` de la condition matchante est utilisé comme statut_detail.
 */
export function evaluateConditions(
  conditions: ConditionNa[] | null | undefined,
  client: ClientContext
): ConditionNa | null {
  if (!conditions || conditions.length === 0) return null;
  for (const c of conditions) {
    if (matches(c, client)) return c;
  }
  return null;
}

function matches(c: ConditionNa, client: ClientContext): boolean {
  const actual = client[c.field];
  switch (c.op) {
    case "eq":
      return actual === c.value;
    case "neq":
      return actual !== c.value;
    case "in":
      if (!Array.isArray(c.value)) return false;
      return c.value.includes(actual as string);
    case "not_in":
      if (!Array.isArray(c.value)) return false;
      return !c.value.includes(actual as string);
    default:
      return false;
  }
}

/**
 * Libellés humains pour la documentation des conditions dans l'UI.
 */
export const FIELD_LABEL: Record<ConditionField, string> = {
  origine: "Origine du dossier",
  gestion_tns: "Gestion TNS",
  forme: "Forme juridique",
  activite: "Activité",
};

export const OP_LABEL: Record<ConditionOp, string> = {
  eq: "égal à",
  neq: "différent de",
  in: "dans la liste",
  not_in: "hors de la liste",
};
