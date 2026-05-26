"use client";

import { useState, useTransition } from "react";
import { PartyPopper } from "lucide-react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import { updateClient, setPipelineStatut } from "./actions";
import { initializeOnboardingForClient } from "@/app/onboarding/actions";

/**
 * Bouton festif "LDM signée 🎉" :
 *  - Déclenche une animation de confettis aux couleurs MOON (gold + crème + emerald)
 *  - Enregistre la date du jour dans `mois_signature`
 *  - Passe le pipeline_statut à "7 - LDM signée"
 *
 * Idempotent : si la LDM est déjà signée, on relance les confettis pour le
 * fun mais on ne re-écrit pas la date (pas envie d'écraser une vraie date
 * de signature antérieure).
 */
export default function LDMSigneeButton({
  clientId,
  alreadySigned,
}: {
  clientId: string;
  alreadySigned: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(alreadySigned);

  function fireConfetti() {
    // 3 secondes de confettis en 2 sources (gauche + droite) pour un effet
    // immersif. Couleurs MOON : gold, crème, emerald, rouge cabinet (mais
    // sobre, pas de néon).
    const duration = 2500;
    const animationEnd = Date.now() + duration;
    const colors = ["#d6cba3", "#c9a96b", "#10b981", "#0D1122"];
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      zIndex: 9999,
      colors,
    };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        window.clearInterval(interval);
        return;
      }
      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.05, 0.25), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.75, 0.95), y: Math.random() - 0.2 },
      });
    }, 250);

    // Burst initial centré, plus dense, pour le bang d'ouverture.
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.55 },
      colors,
      zIndex: 9999,
    });
  }

  function onClick() {
    fireConfetti();
    if (done) return; // déjà signée → juste les confettis pour le fun
    const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    setDone(true);
    startTransition(async () => {
      try {
        // Parallélise les 3 actions : update date + pipeline + init onboarding.
        // L'init des tâches d'onboarding est idempotente (ne re-écrit pas si
        // déjà créées), donc safe à appeler plusieurs fois.
        await Promise.all([
          updateClient(clientId, { mois_signature: today }),
          setPipelineStatut(clientId, "7 - LDM signée"),
          initializeOnboardingForClient(clientId),
        ]);
      } catch (e) {
        setDone(alreadySigned); // rollback
        alert((e as Error).message);
      }
    });
  }

  return (
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
  );
}
