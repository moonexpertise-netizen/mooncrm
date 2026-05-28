"use client";

import { useState, useCallback } from "react";
import confetti from "canvas-confetti";
import AchievementCard, { type AchievementData } from "./achievement-card";
import type { SignatureStats } from "./actions";

/**
 * Hook centralise pour declencher confettis + achievement card a chaque
 * signature LDM, peu importe le chemin :
 *   - Bouton "LDM signee 🎉" sur la fiche client
 *   - Pipeline-picker (radio pills) sur la fiche client
 *   - Drag-and-drop dans le kanban /pipeline
 *   - Picker mobile dans le kanban
 *
 * Usage :
 *   const { celebrate, achievementSlot } = useLdmCelebration();
 *   // dans onPick/onDrag :
 *   const res = await setPipelineStatut(id, "7 - LDM signée");
 *   if (res.signature) celebrate(res.signature);
 *   // rendre <>{achievementSlot}</> dans le JSX
 */

const CONFETTI_COLORS = ["#d6cba3", "#c9a96b", "#10b981", "#0D1122"];

export function useLdmCelebration() {
  const [achievement, setAchievement] = useState<AchievementData | null>(null);

  const celebrate = useCallback((stats: SignatureStats) => {
    fireConfetti();
    // Petit delay pour laisser respirer les confettis avant que la
    // card apparaisse.
    setTimeout(() => {
      setAchievement({
        denomination: stats.client.denomination,
        origine: stats.client.origine,
        clientMrr: stats.client.mrr,
        clientArr: stats.client.arr,
        mrrBefore: stats.mrrBefore,
        mrrAfter: stats.mrrAfter,
      });
    }, 600);
  }, []);

  /** Lance juste les confettis sans achievement card (cas LDM deja signee). */
  const fireConfettiOnly = useCallback(() => {
    fireConfetti();
  }, []);

  const achievementSlot = achievement ? (
    <AchievementCard data={achievement} onClose={() => setAchievement(null)} />
  ) : null;

  return { celebrate, fireConfettiOnly, achievementSlot };
}

function fireConfetti() {
  const duration = 2500;
  const animationEnd = Date.now() + duration;
  const defaults = {
    startVelocity: 30,
    spread: 360,
    ticks: 60,
    zIndex: 9999,
    colors: CONFETTI_COLORS,
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

  // Burst initial centre, plus dense, pour le bang d'ouverture.
  confetti({
    particleCount: 120,
    spread: 80,
    origin: { y: 0.55 },
    colors: CONFETTI_COLORS,
    zIndex: 9999,
  });
}
