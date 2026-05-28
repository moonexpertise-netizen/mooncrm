"use client";

import { toast } from "sonner";

/**
 * Helpers pour notifications toast cohérentes dans tout le CRM.
 *
 * Style :
 *   - Succès : durée courte (2.5s), pas de blabla → "Enregistré"
 *   - Erreur : durée plus longue (5s), message issu de l'erreur
 *   - Sauvegarde inline : pas de toast par défaut (trop bruyant si Benjamin
 *     fait 50 saves d'affilée) - on ne notifie qu'en cas d'erreur, sauf si
 *     explicitement demandé via toastSaveSuccess()
 *
 * Usage :
 *   try {
 *     await serverAction();
 *     toastSaved();           // optionnel
 *   } catch (e) {
 *     toastError(e);
 *   }
 *
 * Ou en wrapper :
 *   await withToast(() => serverAction(), { success: "Client créé" });
 */

/** Toast de succès générique (durée courte). */
export function toastSuccess(message: string) {
  toast.success(message, { duration: 2500 });
}

/** Toast par défaut après save inline. Silencieux par design - voir module doc. */
export function toastSaved(label: string = "Enregistré") {
  toast.success(label, { duration: 1800 });
}

/** Toast d'erreur. Accepte Error, string, ou un objet { message }. */
export function toastError(err: unknown, fallback: string = "Une erreur est survenue") {
  let msg = fallback;
  if (err instanceof Error) msg = err.message || fallback;
  else if (typeof err === "string") msg = err;
  else if (err && typeof err === "object" && "message" in err) {
    msg = String((err as { message: unknown }).message ?? fallback);
  }
  toast.error(msg, { duration: 5000 });
}

/** Toast info (durée moyenne). */
export function toastInfo(message: string) {
  toast.info(message, { duration: 3000 });
}

/**
 * Wrappe une promise avec toast de succès et d'erreur.
 *
 *   await withToast(() => updateClient(...), {
 *     success: "Client mis à jour",
 *     loading: "Mise à jour…",
 *   });
 *
 * Le loading toast disparaît automatiquement quand la promise est settled.
 * Si la promise échoue, le toast bascule en erreur avec le message.
 */
export async function withToast<T>(
  fn: () => Promise<T>,
  opts: { success?: string; loading?: string; error?: string }
): Promise<T> {
  const promise = fn();
  toast.promise(promise, {
    loading: opts.loading ?? "Chargement…",
    success: opts.success ?? "Terminé",
    error: (err) => {
      if (err instanceof Error) return err.message;
      if (typeof err === "string") return err;
      return opts.error ?? "Une erreur est survenue";
    },
  });
  return promise;
}
