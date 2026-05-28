"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPipelineStatut } from "./actions";
import { useAlert } from "@/app/_components/confirm-modal";
import { useLdmCelebration } from "./use-ldm-celebration";

/**
 * Bouton festif "LDM signée 🎉" : passe le pipeline_statut à "7 - LDM signée"
 * via setPipelineStatut (qui gere AUSSI mois_signature + init onboarding +
 * stats MRR cote serveur si c'est une vraie signature).
 *
 * Au retour : confettis + achievement card via le hook centralise (meme
 * pattern qu'utilise PipelinePicker et Pipeline Kanban — coherence totale,
 * peu importe par ou Benjamin signe la LDM).
 *
 * Si deja signe : juste les confettis pour le fun.
 */
export default function LDMSigneeButton({
  clientId,
  alreadySigned,
}: {
  clientId: string;
  alreadySigned: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(alreadySigned);
  const { alert, AlertDialog } = useAlert();
  const { celebrate, fireConfettiOnly, achievementSlot } = useLdmCelebration();

  function onClick() {
    if (done) {
      // Deja signe : juste les confettis pour le fun. Pas de re-signature.
      fireConfettiOnly();
      return;
    }
    setDone(true);
    startTransition(async () => {
      try {
        const res = await setPipelineStatut(clientId, "7 - LDM signée");
        if (res.signature) {
          celebrate(res.signature);
        } else {
          // Defensive : pas de stats mais on a quand meme passe le pipeline.
          fireConfettiOnly();
        }
        // Refresh server-side : la date mois_signature + le badge pipeline
        // sont rendus serveur dans le hero. Sans refresh ils restaient figes
        // jusqu'au prochain reload.
        router.refresh();
      } catch (e) {
        setDone(alreadySigned); // rollback
        await alert({ title: "Erreur", description: (e as Error).message });
      }
    });
  }

  return (
    <>
      {AlertDialog}
      {achievementSlot}
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all",
          "hover:shadow-sm active:scale-95",
          done
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            : "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] border-[hsl(var(--gold))]/40 hover:bg-[hsl(var(--gold))]/20",
          isPending && "opacity-60 cursor-wait"
        )}
        title={
          done
            ? "LDM déjà signée — clique pour fêter à nouveau 🎉"
            : "Marquer le dossier comme signé : pipeline → LDM signée + date du jour"
        }
      >
        <PartyPopper className="h-3.5 w-3.5" />
        {done ? "LDM signée" : "LDM signée 🎉"}
      </button>
    </>
  );
}
