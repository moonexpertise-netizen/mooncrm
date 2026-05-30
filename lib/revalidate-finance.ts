import { revalidatePath } from "next/cache";

/**
 * Invalide le cache Next.js pour les vues qui agregent des donnees facturation
 * cross-modules. A appeler depuis toutes les actions qui modifient un statut,
 * forfait ou etat de facturation susceptible d'apparaitre dans :
 *   - /facturation : liste centralisee des factures a emettre
 *   - /finance     : dashboard MRR / ARR / pipeline pondere / cash mobilisable
 *
 * Sans ca, le Router Cache de Next.js sert une version stale et l'utilisateur
 * doit hard-reload pour voir les nouvelles factures a etablir.
 */
export function revalidateFinanceViews() {
  revalidatePath("/facturation");
  revalidatePath("/finance");
}
