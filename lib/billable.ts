/**
 * Filtre métier "dossier facturable / actif côté production".
 *
 * Centralisé ici parce que la règle est partagée par 4+ pages (onboarding,
 * obligations, tracker, paramétrage) et qu'elle a déjà bougé deux fois
 * (notamment migration 0039 : Z - Sous-traitance origine → 5 - Sous-traitance).
 *
 * Règle :
 *   - pipeline_statut ∈ {"7 - LDM signée", "Z - Interne", "Z - Sous-traitance"}
 *   OU
 *   - origine ∈ {"5 - Sous-traitance"} (legacy : "Z - Sous-traitance")
 *
 * Les dossiers en pipeline pré-signature (1 → 6) ne consomment pas encore
 * d'obligations / d'onboarding actifs.
 */

export const BILLABLE_PIPELINE = new Set<string>([
  "7 - LDM signée",
  "Z - Interne",
  "Z - Sous-traitance",
]);

export const BILLABLE_ORIGINE = new Set<string>([
  "5 - Sous-traitance",
  // Conservé pour les dossiers non encore re-migrés en cas de désalignement
  "Z - Sous-traitance",
]);

export function isClientBillable(c: {
  pipeline_statut: string | null;
  origine: string | null;
}): boolean {
  if (c.pipeline_statut && BILLABLE_PIPELINE.has(c.pipeline_statut)) return true;
  if (c.origine && BILLABLE_ORIGINE.has(c.origine)) return true;
  return false;
}
