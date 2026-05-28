"use server";

import {
  setPipelineStatut,
  type PipelineStatut,
  type SignatureStats,
} from "@/app/clients/[slug]/actions";

/**
 * Change le statut pipeline d'un client (drag-drop Kanban ou picker mobile).
 *
 * Delegue a setPipelineStatut qui centralise toute la logique :
 *   - UPDATE pipeline_statut
 *   - Auto-sync origine pour Z - Interne / Z - Sous-traitance
 *   - Si transition vers "7 - LDM signee" : pose mois_signature + init
 *     onboarding + calcule stats MRR pour l'achievement card cote client.
 *
 * Renvoie { signature: SignatureStats | null }.
 * Le caller (Kanban) utilise res.signature pour declencher confettis +
 * achievement card via useLdmCelebration. Coherence totale avec la
 * fiche client (LDMSigneeButton + PipelinePicker).
 *
 * IMPORTANT — performance : pas de revalidatePath ici. Optimistic update
 * + force-dynamic des pages downstream suffisent. router.refresh() du
 * caller propage les changements sur la page courante.
 */
export async function movePipeline(
  clientId: string,
  statut: PipelineStatut
): Promise<{ signature: SignatureStats | null }> {
  return setPipelineStatut(clientId, statut);
}
