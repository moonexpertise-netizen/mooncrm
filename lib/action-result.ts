/**
 * Pattern uniforme pour les server actions : retourner un resultat structure
 * au lieu de throw.
 *
 *   - Plus robuste en production (Next.js masque les .message des erreurs
 *     thrown dans les actions, on perd l'info utile pour les toasts).
 *   - Type-safe : le caller sait par le type qu'il faut tester `result.ok`.
 *   - Compatible avec les patterns existants try/catch via `unwrap`.
 *
 * Usage cote action :
 *   export async function setEtatFacturation(id: string, etat: EtatFacturation)
 *     : Promise<ActionResult<void>> {
 *     const sb = await createClient();
 *     const { error } = await sb.from(...).update(...);
 *     if (error) return { ok: false, error: error.message };
 *     return { ok: true };
 *   }
 *
 * Usage cote caller :
 *   const res = await setEtatFacturation(id, etat);
 *   if (!res.ok) { toastError(new Error(res.error), "..."); return; }
 *   toastSuccess("Sauve");
 *
 * Ou via unwrap (retro-compatible avec try/catch existant) :
 *   try {
 *     unwrap(await setEtatFacturation(id, etat));
 *   } catch (e) { toastError(e, "..."); }
 */

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Helper retro-compatible : passe le resultat et throw si !ok.
 * Permet aux callers existants en try/catch de continuer a fonctionner
 * sans modification.
 */
export function unwrap<T>(result: ActionResult<T>): T | undefined {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/**
 * Construit un ActionResult depuis un throwable. Wrappe les actions
 * legacy qui jettent encore des Error.
 */
export async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
