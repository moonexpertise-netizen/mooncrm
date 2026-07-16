/**
 * Helper d'historique client cote application (vs trigger Postgres).
 *
 * On a essaye un trigger Postgres dans les migrations 0072-0076 mais il
 * ne fire pas (raison restee non identifiee, probablement une particularite
 * de l'instance Supabase). Plutot que de s'acharner, on log explicitement
 * depuis les server actions qui modifient les champs trackes. Plus simple
 * a debugger et a tester.
 *
 * Trade-off : si quelqu'un modifie un champ via Supabase Studio / SQL Editor
 * directement, ca n'est pas trace. Pour Benjamin c'est OK : 99% des modifs
 * passent par l'app.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Champs dont on veut tracer les modifs (mirror du trigger 0072). */
export const TRACKED_AUDIT_FIELDS = [
  "pipeline_statut",
  "honoraires_compta",
  "forfait_bilan",
  "honoraires_jur",
  "tdb_honos_periode",
  "oss_honos_trimestre",
  "honoraires_creation",
  "honoraires_reprise",
  "mrr_conditionne",
  "mois_signature",
  "gestion_tns",
  "type_honos_bilans",
  "type_honos_jur",
  "type_honos_creation",
  "type_honos_reprise",
  "denomination",
] as const;

type TrackedField = (typeof TRACKED_AUDIT_FIELDS)[number];

/** Source de la mutation - affichee en tag dans l'historique UI. */
export type AuditSource = "manuel" | "jarvis";

/** Compare before/after sur les champs trackes et logge les diffs.
 *
 *  @param sb         Client Supabase server-side
 *  @param clientId   UUID du client
 *  @param before     Snapshot AVANT l'UPDATE (lu de la DB avant mutation)
 *  @param after      Snapshot APRES l'UPDATE (= patch envoye, suffit pour
 *                    deduire la nouvelle valeur des champs concernes)
 *  @param source     "manuel" (UI) ou "jarvis" (IA). Defaut "manuel".
 *
 *  Comportement defensif : si l'INSERT echoue (RLS, permissions, etc.),
 *  on log en console.error mais on ne throw PAS. L'historique est nice-to-have,
 *  une defaillance ne doit jamais bloquer une modif metier legitime.
 */
export async function logClientChanges(
  sb: SupabaseClient,
  clientId: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  source: AuditSource = "manuel",
  motif: string | null = null
): Promise<void> {
  if (!before) return;

  // Recupere l'utilisateur courant pour le tag "par qui"
  const {
    data: { user },
  } = await sb.auth.getUser();
  const userId = user?.id ?? null;
  const email = user?.email ?? null;

  type Row = {
    client_id: string;
    field: string;
    old_value: string | null;
    new_value: string | null;
    changed_by: string | null;
    changed_by_email: string | null;
    source: AuditSource;
    motif: string | null;
  };
  const rows: Row[] = [];

  for (const field of TRACKED_AUDIT_FIELDS) {
    if (!(field in after)) continue;
    const oldV = (before as Record<string, unknown>)[field];
    const newV = after[field as TrackedField];

    // is-distinct-from style : NULL et undefined assimilés
    const oldNorm = oldV == null ? null : oldV;
    const newNorm = newV == null ? null : newV;
    if (oldNorm === newNorm) continue;
    // Numeric comparison : 1500 et "1500" doivent etre traites comme egaux
    if (oldNorm != null && newNorm != null && String(oldNorm) === String(newNorm)) continue;

    rows.push({
      client_id: clientId,
      field,
      old_value: oldNorm == null ? null : String(oldNorm),
      new_value: newNorm == null ? null : String(newNorm),
      changed_by: userId,
      changed_by_email: email,
      source,
      motif,
    });
  }

  if (rows.length === 0) return;

  const { error } = await sb.from("client_audit_log").insert(rows);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[audit-log] insert failed:", error.message);
  }
}
