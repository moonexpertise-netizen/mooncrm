"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setPipelineStatut, type PipelineStatut } from "./actions";
import { useLdmCelebration } from "./use-ldm-celebration";
import { toastError } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";

/**
 * Pipeline "ligne de métro".
 *
 * Les 8 étapes du parcours commercial sont des STATIONS sur une ligne : on
 * clique une station, ou on fait glisser le curseur le long de la ligne. La
 * portion parcourue est remplie, le reste est en pointillé.
 *
 * Les statuts "Z -" (Interne, Sous-traitance, Perdu, Résiliée) ne sont PAS
 * des étapes : on ne progresse pas vers "perdu". Ce sont des SORTIES de
 * parcours, reléguées dans un menu à droite. Quand l'une est active, la
 * ligne passe en gris et un badge affiche la sortie en cours.
 */

const STATIONS: { value: PipelineStatut; short: string; full: string }[] = [
  { value: "1 - Rencontre prospect", short: "Rencontre", full: "1 - Rencontre prospect" },
  { value: "2 - PC à préparer", short: "PC à prép.", full: "2 - PC à préparer" },
  { value: "3 - PC envoyée", short: "PC envoyée", full: "3 - PC envoyée" },
  { value: "4 - PC acceptée", short: "PC acceptée", full: "4 - PC acceptée" },
  { value: "5 - Guide + Tally envoyé", short: "Guide+Tally", full: "5 - Guide + Tally envoyé" },
  { value: "6 - LDM à préparer", short: "LDM à prép.", full: "6 - LDM à préparer" },
  { value: "7 - LDM envoyée", short: "LDM envoyée", full: "7 - LDM envoyée" },
  { value: "8 - LDM signée", short: "Signée", full: "8 - LDM signée" },
];

const EXITS: { value: PipelineStatut; label: string; tone: string }[] = [
  { value: "Z - Interne", label: "Interne", tone: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30" },
  { value: "Z - Sous-traitance", label: "Sous-traitance", tone: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  { value: "Z - Prospect perdu", label: "Prospect perdu", tone: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-white/[0.08] dark:text-zinc-300 dark:border-white/[0.12]" },
  { value: "Z - Perdu dans l'espace", label: "Perdu dans l'espace", tone: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-white/[0.08] dark:text-zinc-300 dark:border-white/[0.12]" },
  { value: "Z - Résiliée", label: "Résiliée", tone: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
];

export default function PipelineMetro({
  clientId,
  current,
}: {
  clientId: string;
  current: PipelineStatut | null;
}) {
  const canEdit = useCan("edit_clients");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState<PipelineStatut | null>(current);
  const { celebrate, achievementSlot } = useLdmCelebration();
  const [exitsOpen, setExitsOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => setLocal(current), [current]);

  const stationIdx = STATIONS.findIndex((s) => s.value === local);
  const exit = EXITS.find((e) => e.value === local) ?? null;
  const progressPct = stationIdx < 0 ? 0 : (stationIdx / (STATIONS.length - 1)) * 100;

  function commit(next: PipelineStatut | null) {
    if (!canEdit) return;
    if (next === local) return;
    const previous = local;
    setLocal(next);
    startTransition(async () => {
      try {
        const res = await setPipelineStatut(clientId, next);
        if (res.signature) celebrate(res.signature);
        router.refresh();
      } catch (e) {
        setLocal(previous);
        toastError(e, "Echec de la mise a jour du statut");
      }
    });
  }

  /** Station la plus proche de la position X du pointeur sur la piste. */
  function stationFromClientX(clientX: number): PipelineStatut | null {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (STATIONS.length - 1));
    return STATIONS[idx]?.value ?? null;
  }

  // Drag du curseur : on suit le pointeur et on n'écrit qu'au relâchement
  // (évite N appels serveur pendant le glissement).
  useEffect(() => {
    if (!canEdit) return;
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      e.preventDefault();
      const next = stationFromClientX(e.clientX);
      if (next) setLocal(next);
    }
    function onUp(e: PointerEvent) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const next = stationFromClientX(e.clientX);
      if (next) {
        // commit compare à `local` : on force via la valeur serveur d'origine.
        if (next !== current) {
          setLocal(next);
          startTransition(async () => {
            try {
              const res = await setPipelineStatut(clientId, next);
              if (res.signature) celebrate(res.signature);
              router.refresh();
            } catch (err) {
              setLocal(current);
              toastError(err, "Echec de la mise a jour du statut");
            }
          });
        }
      }
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, current, clientId]);

  const inactive = exit !== null;

  return (
    <>
      {achievementSlot}
      <div
        className={cn(
          "rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card px-4 py-3.5",
          isPending && "opacity-90"
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">Pipeline</span>
            {exit && (
              <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium border", exit.tone)}>
                {exit.label}
              </span>
            )}
            {!exit && stationIdx >= 0 && (
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate">
                {STATIONS[stationIdx].full}
              </span>
            )}
            {!exit && stationIdx < 0 && (
              <span className="text-xs text-zinc-400">Aucune étape</span>
            )}
          </div>

          {/* Sorties de parcours : hors de la ligne (ce ne sont pas des étapes) */}
          <div className="relative shrink-0">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setExitsOpen((v) => !v)}
              onBlur={() => setTimeout(() => setExitsOpen(false), 150)}
              className="text-[11px] px-2 py-1 rounded-md border border-zinc-200 dark:border-white/[0.10] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
            >
              Sortir du parcours ▾
            </button>
            {exitsOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-[hsl(var(--card))] shadow-xl overflow-hidden animate-slide-up-fade">
                {EXITS.map((x) => (
                  <button
                    key={x.value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setExitsOpen(false);
                      commit(local === x.value ? null : x.value);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.06]",
                      local === x.value && "font-semibold text-zinc-900 dark:text-zinc-50"
                    )}
                  >
                    {x.label}
                    {local === x.value && <span className="float-right text-[hsl(var(--gold))]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* La ligne */}
        <div className="relative pt-1 pb-6 select-none" ref={trackRef}>
          {/* Rail */}
          <div className="absolute left-0 right-0 top-[13px] h-[3px] rounded-full bg-zinc-200 dark:bg-white/[0.10]" />
          {/* Portion parcourue */}
          <div
            className={cn(
              "absolute left-0 top-[13px] h-[3px] rounded-full transition-[width] duration-300",
              inactive ? "bg-zinc-300 dark:bg-white/[0.18]" : "bg-[hsl(var(--gold))]"
            )}
            style={{ width: `${progressPct}%` }}
          />

          <div className="relative flex items-start justify-between">
            {STATIONS.map((s, i) => {
              const done = stationIdx >= 0 && i <= stationIdx;
              const isCurrent = i === stationIdx;
              return (
                <div key={s.value} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                  <button
                    type="button"
                    disabled={!canEdit}
                    aria-label={s.full}
                    aria-current={isCurrent ? "step" : undefined}
                    title={s.full}
                    onClick={() => commit(isCurrent ? null : s.value)}
                    onPointerDown={(e) => {
                      if (!canEdit || !isCurrent) return;
                      // Le curseur (station courante) est saisissable.
                      draggingRef.current = true;
                      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                    }}
                    className={cn(
                      "relative z-10 rounded-full border-2 transition-all",
                      isCurrent
                        ? "w-5 h-5 cursor-grab active:cursor-grabbing shadow-md"
                        : "w-3.5 h-3.5 mt-[3px]",
                      !canEdit && "cursor-not-allowed",
                      inactive
                        ? "bg-zinc-200 border-zinc-300 dark:bg-white/[0.10] dark:border-white/20"
                        : done
                        ? "bg-[hsl(var(--gold))] border-[hsl(var(--gold))]"
                        : "bg-white dark:bg-[hsl(var(--card))] border-zinc-300 dark:border-white/20 hover:border-[hsl(var(--gold))]"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[9.5px] leading-tight text-center truncate max-w-full px-0.5",
                      isCurrent && !inactive
                        ? "text-zinc-900 dark:text-zinc-50 font-semibold"
                        : "text-zinc-400 dark:text-zinc-500"
                    )}
                  >
                    {s.short}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
