"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TrendingUp, Trophy, X } from "lucide-react";
import { cn, fmtEuro } from "@/lib/utils";

/**
 * Achievement Card type jeu video qui s'affiche apres les confettis quand
 * Benjamin signe une LDM. Montre :
 *   - Le nom du nouveau client + son origine
 *   - Le MRR du cabinet AVANT et APRES (compteur rolling)
 *   - Une barre de progression vers le prochain palier MRR
 *   - Le delta + ARR
 *   - Si un palier est franchi : variante or marquee "PALIER FRANCHI"
 *
 * Apparition : slide-up + fade-in en bas-droite (mobile : centre bas).
 * Auto-dismiss apres 8s, ou clic sur X ou hors de la card.
 */

const MRR_TIERS = [5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000];

export type AchievementData = {
  denomination: string;
  origine: string | null;
  clientMrr: number;
  clientArr: number;
  mrrBefore: number;
  mrrAfter: number;
};

export default function AchievementCard({
  data,
  onClose,
}: {
  data: AchievementData;
  onClose: () => void;
}) {
  const [animatedMrr, setAnimatedMrr] = useState(data.mrrBefore);

  // Compteur rolling : anime de mrrBefore a mrrAfter sur ~1.8s avec
  // ease-out cubique (rapide au debut, ralentit a la fin).
  useEffect(() => {
    const start = performance.now();
    const duration = 1800;
    let frame = 0;
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = data.mrrBefore + (data.mrrAfter - data.mrrBefore) * eased;
      setAnimatedMrr(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [data.mrrBefore, data.mrrAfter]);

  // Auto-dismiss apres 8s
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [onClose]);

  // Echap pour fermer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Palier en cours = le plus petit palier > mrrAfter (vers lequel on tend)
  // Palier franchi = il existe un palier dans ]mrrBefore, mrrAfter]
  const tierJustReached = MRR_TIERS.find(
    (t) => t > data.mrrBefore && t <= data.mrrAfter
  );
  const nextTier =
    MRR_TIERS.find((t) => t > data.mrrAfter) ?? MRR_TIERS[MRR_TIERS.length - 1];
  const prevTier = MRR_TIERS.filter((t) => t <= data.mrrAfter).pop() ?? 0;
  const pctToNext =
    nextTier > prevTier
      ? Math.min(100, Math.max(0, ((data.mrrAfter - prevTier) / (nextTier - prevTier)) * 100))
      : 100;

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Overlay invisible pour capter le clic hors carte */}
      <div
        className="fixed inset-0 z-[999]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="achievement-title"
        className="fixed z-[1000] left-1/2 -translate-x-1/2 bottom-4 md:bottom-6 md:left-auto md:right-6 md:translate-x-0 w-[calc(100vw-32px)] md:w-[400px] animate-achievement-pop"
      >
        <div
          className={cn(
            "rounded-2xl shadow-2xl overflow-hidden border-2 backdrop-blur-md",
            tierJustReached
              ? // Variante or : palier franchi
                "bg-gradient-to-br from-[hsl(var(--gold))]/95 via-[hsl(var(--gold))]/90 to-amber-500/95 border-[hsl(var(--gold-dark))]/40"
              : // Variante standard : carte sombre premium
                "bg-gradient-to-br from-zinc-900/98 via-zinc-900/95 to-zinc-800/98 border-[hsl(var(--gold))]/30"
          )}
        >
          {/* Header */}
          <div
            className={cn(
              "flex items-center justify-between gap-2 px-4 py-3 border-b",
              tierJustReached
                ? "bg-amber-600/20 border-amber-700/30"
                : "bg-black/30 border-white/[0.08]"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Trophy
                className={cn(
                  "h-5 w-5 shrink-0",
                  tierJustReached ? "text-amber-100" : "text-[hsl(var(--gold))]"
                )}
                aria-hidden="true"
              />
              <h2
                id="achievement-title"
                className={cn(
                  "text-[11px] uppercase tracking-[0.15em] font-bold truncate",
                  tierJustReached ? "text-amber-50" : "text-[hsl(var(--gold))]"
                )}
              >
                {tierJustReached
                  ? `🎖 Palier ${fmtTierLabel(tierJustReached)} franchi`
                  : "Nouveau client signé"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className={cn(
                "shrink-0 p-1 rounded-md transition-colors",
                tierJustReached
                  ? "text-amber-100 hover:bg-amber-700/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.08]"
              )}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-4 space-y-3.5">
            {/* Nom client + origine */}
            <div>
              <div
                className={cn(
                  "text-base font-semibold truncate",
                  tierJustReached ? "text-amber-50" : "text-white"
                )}
              >
                {data.denomination}
              </div>
              {data.origine && (
                <div
                  className={cn(
                    "text-[11px] mt-0.5",
                    tierJustReached ? "text-amber-100/80" : "text-zinc-400"
                  )}
                >
                  {data.origine}
                </div>
              )}
            </div>

            {/* MRR transition */}
            <div className="space-y-1.5">
              <div
                className={cn(
                  "text-[10px] uppercase tracking-wide font-medium",
                  tierJustReached ? "text-amber-100/70" : "text-zinc-500"
                )}
              >
                MRR du cabinet
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className={cn(
                    "text-xs tabular-nums line-through",
                    tierJustReached ? "text-amber-100/50" : "text-zinc-500"
                  )}
                >
                  {fmtEuro(Math.round(data.mrrBefore))}
                </span>
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums tracking-tight",
                    tierJustReached ? "text-white" : "text-[hsl(var(--gold))]"
                  )}
                >
                  {fmtEuro(Math.round(animatedMrr))}
                </span>
                <TrendingUp
                  className={cn(
                    "h-4 w-4",
                    tierJustReached ? "text-white" : "text-emerald-400"
                  )}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Barre de progression vers le prochain palier */}
            <div className="space-y-1">
              <div className="flex items-baseline justify-between text-[10px]">
                <span
                  className={cn(
                    "uppercase tracking-wide",
                    tierJustReached ? "text-amber-100/70" : "text-zinc-500"
                  )}
                >
                  Vers {fmtTierLabel(nextTier)}
                </span>
                <span
                  className={cn(
                    "tabular-nums font-semibold",
                    tierJustReached ? "text-amber-100" : "text-zinc-300"
                  )}
                >
                  {Math.round(pctToNext)} %
                </span>
              </div>
              <div
                className={cn(
                  "h-2 rounded-full overflow-hidden",
                  tierJustReached ? "bg-amber-700/30" : "bg-white/[0.08]"
                )}
              >
                <div
                  className={cn(
                    "h-full transition-[width] duration-[1800ms] ease-out rounded-full",
                    tierJustReached
                      ? "bg-gradient-to-r from-amber-200 to-white"
                      : "bg-gradient-to-r from-[hsl(var(--gold))] to-emerald-400"
                  )}
                  style={{ width: `${pctToNext}%` }}
                />
              </div>
            </div>

            {/* Gains */}
            <div
              className={cn(
                "flex items-baseline justify-around gap-2 pt-1.5 border-t",
                tierJustReached ? "border-amber-700/30" : "border-white/[0.06]"
              )}
            >
              <div className="text-center">
                <div
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    tierJustReached ? "text-white" : "text-emerald-400"
                  )}
                >
                  +{fmtEuro(data.clientMrr)}
                </div>
                <div
                  className={cn(
                    "text-[10px] uppercase tracking-wide",
                    tierJustReached ? "text-amber-100/70" : "text-zinc-500"
                  )}
                >
                  / mois
                </div>
              </div>
              <div
                className={cn(
                  "w-px h-8",
                  tierJustReached ? "bg-amber-700/30" : "bg-white/[0.10]"
                )}
                aria-hidden
              />
              <div className="text-center">
                <div
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    tierJustReached ? "text-white" : "text-emerald-400"
                  )}
                >
                  +{fmtEuro(data.clientArr)}
                </div>
                <div
                  className={cn(
                    "text-[10px] uppercase tracking-wide",
                    tierJustReached ? "text-amber-100/70" : "text-zinc-500"
                  )}
                >
                  / an
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

/** "20 000 €" -> "20 K €" pour les paliers (plus compact dans l'UI). */
function fmtTierLabel(amount: number): string {
  if (amount >= 1000) {
    const k = amount / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)} k €`;
  }
  return `${amount} €`;
}
