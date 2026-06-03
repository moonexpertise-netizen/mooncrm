/**
 * Helper de selection multi-chips type Excel/Finder/Notion :
 *
 *   - Clic simple sur un chip            -> filtre uniquement par cette cle
 *                                            (remplace l'ancienne selection)
 *   - Clic simple sur le chip deja seul  -> clear (revient a "Tous")
 *   - Cmd/Ctrl + clic                    -> toggle (ajoute / retire)
 *
 * Utilise par les filtres d'etat (a_faire / en_cours / termine) et de
 * facturation (a_facturer / facturee / sans_facture) dans les tables
 * IR / CAA / Creations / Missions exc / Pilotage / tracker-table.
 *
 * Set vide = aucun filtre actif = equivalent a "Tous" affiche.
 */
export function toggleFilterKey<T>(
  current: Set<T>,
  key: T,
  e?: { metaKey?: boolean; ctrlKey?: boolean }
): Set<T> {
  const isMeta = !!(e?.metaKey || e?.ctrlKey);
  if (isMeta) {
    // Toggle : ajoute si absent, retire si present
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }
  // Clic simple :
  //  - si la cle est deja la SEULE selectionnee -> clear (revient a "Tous")
  //  - sinon -> remplace la selection par [key]
  if (current.size === 1 && current.has(key)) return new Set();
  return new Set([key]);
}
