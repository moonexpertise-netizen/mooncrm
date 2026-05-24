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

const FIELD_MAP: Array<{
  re: RegExp;
  field: string;
  transform?: (v: string) => string | null;
}> = [
  { re: /(nom|d[ée]nomination).*soci[ée]t[ée]|raison.?sociale/i, field: "denomination" },
  { re: /^siren$|num[ée]ro.*siren/i, field: "siren", transform: (v) => v.replace(/\D/g, "") || null },
  { re: /forme.?juridique/i, field: "forme", transform: (v) => normalizeEnum(v, FORME_VALUES) },
  { re: /activit[ée]/i, field: "activite" },
  { re: /^email$|adresse.?mail|courriel/i, field: "email", transform: (v) => v.toLowerCase().trim() },
  { re: /adresse.*si[èe]ge|adresse.*social/i, field: "adresse_siege" },
  { re: /code.?postal|^cp$/i, field: "code_postal", transform: (v) => v.replace(/\D/g, "").slice(0, 5) || null },
  { re: /^ville$|commune/i, field: "ville" },
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

/** Extrait les infos dirigeant à appliquer sur un contact. */
export function buildDirigeantPatch(fields: TallyField[]) {
  const nom = findFieldValue(fields, /nom.*dirigeant|nom\s*(?:&|et)?\s*pr[ée]nom/i);
  const prenom = findFieldValue(fields, /pr[ée]nom.*dirigeant|^pr[ée]nom$/i);
  const civilite = findFieldValue(fields, /civilit[ée]|^titre$|^genre$/i);
  const email = findFieldValue(fields, /email.*dirigeant|email.*contact/i);
  const tel = findFieldValue(fields, /t[ée]l[ée]phone|^tel$|^t[ée]l$/i);

  const fullName = [prenom, nom].filter(Boolean).join(" ").trim() || nom;
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
    guess_denomination: findFieldValue(fields, /(nom|d[ée]nomination).*soci[ée]t[ée]|raison.?sociale/i),
    guess_email:
      findFieldValue(fields, /^email$|adresse.?mail|courriel/i) ||
      findFieldValue(fields, /email.*dirigeant|email.*contact/i),
    guess_siren:
      findFieldValue(fields, /^siren$|num[ée]ro.*siren/i)?.replace(/\D/g, "") || null,
  };
}
