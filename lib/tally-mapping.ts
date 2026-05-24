/**
 * Logique de mapping des réponses Tally vers les colonnes CRM.
 * Utilisée à la fois par le webhook (stockage) et par l'action
 * `attachTallyResponse` (application sur un client choisi).
 */

export type TallyField = {
  key: string;
  label: string;
  type: string;
  value: string | string[] | number | boolean | null;
};

export type TallyPayload = {
  eventId: string;
  eventType: string;
  createdAt: string;
  data: {
    responseId: string;
    submissionId: string;
    formId: string;
    formName: string;
    fields: TallyField[];
  };
};

const FORME_VALUES = new Set([
  "ASSO", "SA", "SCI", "EI", "SARL", "SAS", "SELARL", "SELAS",
  "SCM", "SC", "EURL", "SASU", "INDIV", "AARPI", "LMNP",
]);

function normalizeEnum(value: string, allowed: Set<string>): string | null {
  const up = value.trim().toUpperCase();
  return allowed.has(up) ? up : null;
}

// Mapping calé sur les VRAIS labels des formulaires Tally MOON.
// Important : pour les champs où Tally renvoie un UUID (dropdowns à options
// configurées dans Tally) — typiquement "Forme juridique" — on saute, c'est
// non-mappable sans le mapping UUID → libellé qu'on n'a pas côté CRM.
const FIELD_MAP: Array<{
  re: RegExp;
  field: string;
  transform?: (v: string) => string | null;
}> = [
  // Dénomination · "Dénomination sociale de la société à créer" / "Raison sociale"
  { re: /d[ée]nomination|raison.?sociale/i, field: "denomination" },

  // SIREN · "SIREN" / "Numéro de SIREN"
  { re: /^siren\b|num[ée]ro.*siren/i, field: "siren", transform: (v) => v.replace(/\D/g, "") || null },

  // Activité · "Activité de l'entreprise envisagée"
  { re: /activit[ée]/i, field: "activite" },

  // Email · "Adresse mail de contact" / "Email"
  { re: /adresse.?mail|courriel|^email\b/i, field: "email", transform: (v) => v.toLowerCase().trim() },

  // Adresse siège · "Adresse de domiciliation de la société" / "Adresse du siège"
  { re: /adresse.*(domiciliation|si[èe]ge|social)/i, field: "adresse_siege" },

  // Code postal du siège uniquement (pas la résidence du dirigeant)
  {
    re: /code.?postal.*(si[èe]ge|social|domiciliation)|^code.?postal$|^cp\b/i,
    field: "code_postal",
    transform: (v) => v.replace(/\D/g, "").slice(0, 5) || null,
  },

  // Ville du siège uniquement (pas la résidence du dirigeant, pas la ville de naissance)
  { re: /ville.*(si[èe]ge|social|domiciliation)|^ville$/i, field: "ville" },
];

export function findFieldValue(fields: TallyField[], pattern: RegExp): string | null {
  for (const f of fields) {
    if (pattern.test(f.label) || pattern.test(f.key)) {
      const v = f.value;
      if (v === null || v === undefined) return null;
      if (Array.isArray(v)) return v.join(", ");
      return String(v).trim() || null;
    }
  }
  return null;
}

/** Construit le patch à appliquer sur un client à partir des fields Tally. */
export function buildClientPatch(fields: TallyField[]): { patch: Record<string, string>; skipped: string[] } {
  const patch: Record<string, string> = {};
  const skipped: string[] = [];
  for (const { re, field, transform } of FIELD_MAP) {
    const raw = findFieldValue(fields, re);
    if (raw === null || raw === "") continue;
    const normalized = transform ? transform(raw) : raw;
    if (normalized === null) {
      skipped.push(`${field}="${raw}"`);
      continue;
    }
    patch[field] = normalized;
  }
  return { patch, skipped };
}

/** Extrait les infos dirigeant à appliquer sur un contact.
 *
 * Stratégie en cascade :
 *   1. "Nom de l'associé" + "Informations relatives à l'associé / dirigeant" (= prénom)
 *      → champs explicites du Tally Création MOON
 *   2. "Prénom & Nom du contact" → split sur dernier espace
 *   3. "Nom du dirigeant" / "Prénom du dirigeant" → fallback générique
 *
 * Email : on lit d'abord "Adresse mail de contact" (qui sert aussi pour le client)
 * Téléphone : "Numéro de téléphone"
 */
export function buildDirigeantPatch(fields: TallyField[]) {
  // Stratégie 1 : champs structurés associé / dirigeant
  let prenom = findFieldValue(
    fields,
    /informations.*relatives.*(associ[ée]|dirigeant)|pr[ée]nom.*(associ[ée]|dirigeant)/i
  );
  let nom = findFieldValue(
    fields,
    /^nom\s+de\s+l['']?associ[ée]|nom.*dirigeant/i
  );

  // Stratégie 2 : champ unique "Prénom & Nom du contact"
  if (!prenom && !nom) {
    const full = findFieldValue(fields, /pr[ée]nom.*(?:&|&amp;|et).*nom|nom.*(?:&|&amp;|et).*pr[ée]nom/i);
    if (full) {
      const parts = full.trim().split(/\s+/);
      if (parts.length >= 2) {
        nom = parts.at(-1) ?? null;
        prenom = parts.slice(0, -1).join(" ");
      } else {
        nom = full;
      }
    }
  }

  // Stratégie 3 : fallback générique "Prénom" + "Nom"
  if (!prenom) prenom = findFieldValue(fields, /^pr[ée]nom\b/i);
  if (!nom) nom = findFieldValue(fields, /^nom\b/i);

  const civilite = findFieldValue(fields, /civilit[ée]|^titre$|^genre$/i);
  const email = findFieldValue(
    fields,
    /email.*dirigeant|email.*contact|adresse.?mail.*contact|^adresse.?mail/i
  );
  const tel = findFieldValue(fields, /num[ée]ro.*t[ée]l[ée]phone|t[ée]l[ée]phone|^tel$|^t[ée]l$/i);

  const fullName = [prenom, nom].filter(Boolean).join(" ").trim();
  if (!fullName) return null;

  const civNorm: "M." | "Mme" | "Mlle" | null = civilite
    ? civilite.toLowerCase().startsWith("mme") || civilite.toLowerCase().startsWith("mada")
      ? "Mme"
      : civilite.toLowerCase().startsWith("mlle") || civilite.toLowerCase().startsWith("mademo")
      ? "Mlle"
      : "M."
    : null;

  return { nom: fullName, civilite: civNorm, email, telephone: tel };
}

/** Extrait des "guesses" pour faciliter la recherche dans l'inbox. */
export function extractGuesses(fields: TallyField[]) {
  return {
    guess_denomination: findFieldValue(fields, /d[ée]nomination|raison.?sociale/i),
    guess_email:
      findFieldValue(fields, /adresse.?mail|courriel|^email\b/i) ||
      findFieldValue(fields, /email.*dirigeant|email.*contact/i),
    guess_siren:
      findFieldValue(fields, /^siren\b|num[ée]ro.*siren/i)?.replace(/\D/g, "") || null,
  };
}
