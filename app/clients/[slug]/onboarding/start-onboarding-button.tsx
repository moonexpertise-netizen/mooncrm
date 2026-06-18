"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import { initializeOnboardingForClient } from "@/app/onboarding/actions";

/**
 * Bouton "Lancer l'onboarding" pour les dossiers qui n'ont pas encore de
 * taches d'onboarding (typiquement les dossiers Z - Interne / Z - Sous-
 * traitance qui n'ont pas signe de LDM commerciale, ou tout dossier
 * billable cree avant la migration onboarding).
 *
 * Idempotent : si des taches existent deja elles sont conservees. Si rien
 * n'est cree (parcours par defaut absent), un toast info l'explique.
 */
export default function StartOnboardingButton({ clientId }: { clientId: string }) {
  const canEdit = useCan("edit_production");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (isPending || !canEdit) return;
    startTransition(async () => {
      try {
        const res = await initializeOnboardingForClient(clientId);
        if (res.created > 0) {
          toastSuccess(`${res.created} tache${res.created > 1 ? "s" : ""} d'onboarding cree${res.created > 1 ? "es" : "e"}`);
        } else if (res.totalTasks > 0) {
          toastSuccess("Onboarding deja initialise");
        } else {
          toastError("Aucun parcours par defaut configure (cf. /onboarding/parametrage)");
        }
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de l'initialisation");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending || !canEdit}
      title={canEdit ? undefined : "Droit de production requis"}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      {isPending ? "Initialisation…" : "Lancer l'onboarding"}
    </button>
  );
}
