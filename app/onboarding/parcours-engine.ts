/**
 * Moteur d'évaluation des conditions d'un parcours d'onboarding.
 *
 * Une étape peut être marquée NON_APPLICABLE automatiquement à la création
 * d'un onboarding selon des conditions stockées en JSONB dans
 * `onboarding_etape.conditions_na`.
 *
 * Format (depuis migration 0044) :
 *
 *   {
 *     "combinator": "AND" | "OR",
 *     "items": [
 *       { "field": "origine", "op": "eq", "values": ["1 - Création", "2 - Reprise"] },
 *       { "field": "gestion_tns", "op": "neq", "values": [true] }
 *     ]
 *   }
 *
 * Sémantique :
 *   - Dans une condition (un "item") :
 *       - op="eq"  : matche si la valeur du client est INCLUSE dans `values`
 *       - op="neq" : matche si la valeur du client n'est PAS dans `values`
 *     (donc `values` vide → l'item ne matche jamais)
 *   - Entre items :
 *       - combinator="OR"  : matche si au moins un item matche
 *       - combinator="AND" : matche si tous les items matchent
 *
 * Format legacy (avant migration 0044, support tolérant) :
 *   Tableau `[{ field, op: 'eq'|'neq'|'in'|'not_in', value, reason }, ...]`
 *   évalué en OR. Converti à la volée par `normalize()` ci-dessous.
 */

export type ConditionField = "origine" | "gestion_tns" | "forme" | "activite";
export type ConditionOp = "eq" | "neq";
export type Combinator = "AND" | "OR";

export type ConditionItem = {
  field: ConditionField;
  op: ConditionOp;
  values: Array<string | boolean>;
};

export type ConditionsNa = {
  combinator: Combinator;
  items: ConditionItem[];
};

/** Forme legacy pour le support de transition. */
type LegacyCondition = {
  field: ConditionField;
  op: "eq" | "neq" | "in" | "not_in";
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
 * Normalise une valeur JSON quelconque (nouveau ou legacy) vers ConditionsNa.
 * Tolère null, [], tableau legacy, objet incomplet.
 */
export function normalize(raw: unknown): ConditionsNa {
  if (raw == null) return { combinator: "OR", items: [] };

  // Nouveau format (objet)
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Partial<ConditionsNa>;
    const combinator: Combinator = obj.combinator === "AND" ? "AND" : "OR";
    const items: ConditionItem[] = Array.isArray(obj.items)
      ? obj.items
          .filter((it): it is ConditionItem => !!it && typeof it === "object" && "field" in it)
          .map((it) => ({
            field: it.field,
            op: (it.op === "neq" ? "neq" : "eq") as ConditionOp,
            values: Array.isArray(it.values) ? it.values : [],
          }))
      : [];
    return { combinator, items };
  }

  // Format legacy : tableau de conditions
  if (Array.isArray(raw)) {
    const legacy = raw as LegacyCondition[];
    const items: ConditionItem[] = legacy
      .filter((c) => c && typeof c === "object" && c.field)
      .map((c) => {
        // in/not_in → eq/neq avec values[]
        if (c.op === "in") {
          return {
            field: c.field,
            op: "eq",
            values: Array.isArray(c.value) ? c.value : [c.value as string],
          };
        }
        if (c.op === "not_in") {
          return {
            field: c.field,
            op: "neq",
            values: Array.isArray(c.value) ? c.value : [c.value as string],
          };
        }
        // eq/neq → eq/neq avec values=[value]
        return {
          field: c.field,
          op: c.op === "neq" ? "neq" : "eq",
          values: [c.value as string | boolean],
        };
      });
    return { combinator: "OR", items };
  }

  return { combinator: "OR", items: [] };
}

/**
 * Évalue les conditions contre un client.
 * Retourne true si la tâche doit être créée en NON_APPLICABLE.
 */
export function shouldBeNa(raw: unknown, client: ClientContext): boolean {
  const cond = normalize(raw);
  if (cond.items.length === 0) return false;

  const results = cond.items.map((it) => matchesItem(it, client));
  if (cond.combinator === "AND") return results.every(Boolean);
  return results.some(Boolean);
}

function matchesItem(item: ConditionItem, client: ClientContext): boolean {
  if (item.values.length === 0) return false; // pas de valeur cible → n'évalue à rien
  const actual = client[item.field];
  if (item.op === "eq") {
    return item.values.some((v) => v === actual);
  }
  // neq : aucune des values ne doit matcher → équivalent à NOT IN
  return item.values.every((v) => v !== actual);
}

// ---------------------------------------------------------------------------
// Libellés humains pour l'UI
// ---------------------------------------------------------------------------

export const FIELD_LABEL: Record<ConditionField, string> = {
  origine: "Origine du dossier",
  gestion_tns: "Gestion TNS",
  forme: "Forme juridique",
  activite: "Activité",
};

export const OP_LABEL: Record<ConditionOp, string> = {
  eq: "est",
  neq: "n'est pas",
};

export const COMBINATOR_LABEL: Record<Combinator, string> = {
  AND: "ET",
  OR: "OU",
};
