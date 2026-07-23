"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPipelineStatut, type PipelineStatut } from "./actions";
import { useLdmCelebration } from "./use-ldm-celebration";
import { toastError } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";

/**
 * Pipeline commercial en "stepper" numéroté.
 *
 * Priorité de lecture : on doit savoir OÙ ON EST en un coup d'œil.
 *   1. Un titre explicite "Étape 4 sur 8 · PC acceptée"
 *   2. L'étape courante est une pastille dorée pleine, agrandie, avec halo
 *   3. Les étapes franchies portent un ✓, les suivantes sont en gris
 *
 * Les statuts "Z -" ne sont pas des étapes (on ne progresse pas vers "perdu")
 * mais des SORTIES de parcours : menu dédié, et la frise passe en gris.
 */

const STATIONS: { value: PipelineStatut; short: string; full: string }[] = [
  { value: "1 - Rencontre prospect", short: "Rencontre prospect", full: "Rencontre prospect" },
  { value: "2 - PC à préparer", short: "PC à préparer", full: "Proposition commerciale à préparer" },
  { value: "3 - PC envoyée", short: "PC envoyée", full: "Proposition commerciale envoyée" },
  { value: "4 - PC acceptée", short: "PC acceptée", full: "Proposition commerciale acceptée" },
  { value: "5 - Guide + Tally envoyé", short: "Guide + Tally", full: "Guide + Tally envoyé" },
  { value: "6 - LDM à préparer", short: "LDM à préparer", full: "Lettre de mission à préparer" },
  { value: "7 - LDM envoyée", short: "LDM envoyée", full: "Lettre de mission envoyée" },
  { value: "8 - LDM signée", short: "LDM signée", full: "Lettre de mission signée" },
];

const EXITS: { value: PipelineStatut; label: string; tone: string }[] = [
  { value: "Z - Interne", label: "Interne", tone: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30" },
  { value: "Z - Sous-traitance", label: "Sous-traitance", tone: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  { value: "Z - Prospect perdu", label: "Prospect perdu", tone: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-white/[0.10] dark:text-zinc-300 dark:border-white/[0.15]" },
  { value: "Z - Perdu dans l'espace", label: "Perdu dans l'espace", tone: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-white/[0.10] dark:text-zinc-300 dark:border-white/[0.15]" },
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
  const [hovered, setHovered] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => setLocal(current), [current]);

  const idx = STATIONS.findIndex((s) => s.value === local);
  const exit = EXITS.find((e) => e.value === local) ?? null;
  const inactive = exit !== null;

  function persist(next: PipelineStatut | null, rollbackTo: PipelineStatut | null) {
    startTransition(async () => {
      try {
        const res = await setPipelineStatut(clientId, next);
        if (res.signature) celebrate(res.signature);
        router.refresh();
      } catch (e) {
        setLocal(rollbackTo);
        toastError(e, "Echec de la mise a jour du statut");
      }
    });
  }

  function commit(next: PipelineStatut | null) {
    if (!canEdit || next === local) return;
    const previous = local;
    setLocal(next);
    persist(next, previous);
  }

  function stationFromClientX(clientX: number): PipelineStatut | null {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    // Les pastilles sont centrées dans des colonnes d'égale largeur : on
    // convertit la position en index de colonne.
    const colW = rect.width / STATIONS.length;
    const i = Math.min(
      STATIONS.length - 1,
      Math.max(0, Math.floor((clientX - rect.left) / colW))
    );
    return STATIONS[i].value;
  }

  // Glisser le curseur : on suit en local, on n'écrit qu'au relâchement.
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
      if (next && next !== current) {
        setLocal(next);
        persist(next, current);
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

  return (
    <>
      {achievementSlot}
      <div
        className={cn(
          "rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card px-4 sm:px-5 py-4",
          isPending && "opacity-90"
        )}
      >
        {/* ── En-tête : où on en est, en toutes lettres ── */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {exit ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  Hors parcours
                </span>
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold border", exit.tone)}>
                  {exit.label}
                </span>
              </div>
            ) : idx >= 0 ? (
              <>
                <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  Étape {idx + 1} sur {STATIONS.length}
                </div>
                <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50 leading-tight mt-0.5 truncate">
                  {STATIONS[idx].full}
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">Pipeline</div>
                <div className="text-base font-semibold text-zinc-400 leading-tight mt-0.5">
                  Aucune étape, clique une pastille
                </div>
              </>
            )}
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setExitsOpen((v) => !v)}
              onBlur={() => setTimeout(() => setExitsOpen(false), 150)}
              className="text-[11px] px-2 py-1 rounded-md border border-zinc-200 dark:border-white/[0.10] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
            >
              {exit ? "Changer" : "Sortir du parcours"} ▾
            </button>
            {exitsOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-lg border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-[hsl(var(--card))] shadow-xl overflow-hidden animate-slide-up-fade">
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
                {exit && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setExitsOpen(false);
                      commit(null);
                    }}
                    className="w-full text-left px-3 py-2 text-sm border-t border-zinc-100 dark:border-white/[0.08] text-zinc-500 hover:bg-zinc-50 dark:hover:bg-white/[0.06]"
                  >
                    Revenir dans le parcours
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── La frise ── */}
        <div
          ref={trackRef}
          className={cn("relative select-none", inactive && "opacity-45 grayscale")}
        >
          <div className="flex items-start">
            {STATIONS.map((s, i) => {
              const done = idx >= 0 && i < idx;
              const isCurrent = i === idx;
              const isHover = hovered === i;
              return (
                <div
                  key={s.value}
                  className="relative flex-1 min-w-0 flex flex-col items-center"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Segments de liaison : dessinés dans la colonne, à gauche
                      et à droite de la pastille, pour rester alignés quelle
                      que soit la largeur. */}
                  {i > 0 && (
                    <span
                      className={cn(
                        "absolute top-[15px] right-1/2 left-0 h-[3px]",
                        done || isCurrent ? "bg-[hsl(var(--gold))]" : "bg-zinc-200 dark:bg-white/[0.10]"
                      )}
                    />
                  )}
                  {i < STATIONS.length - 1 && (
                    <span
                      className={cn(
                        "absolute top-[15px] left-1/2 right-0 h-[3px]",
                        done ? "bg-[hsl(var(--gold))]" : "bg-zinc-200 dark:bg-white/[0.10]"
                      )}
                    />
                  )}

                  <button
                    type="button"
                    disabled={!canEdit}
                    title={s.full}
                    aria-label={`Étape ${i + 1} : ${s.full}`}
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => commit(isCurrent ? null : s.value)}
                    onPointerDown={() => {
                      if (canEdit && isCurrent) draggingRef.current = true;
                    }}
                    className={cn(
                      "relative z-10 rounded-full flex items-center justify-center font-semibold transition-all",
                      isCurrent
                        ? "w-8 h-8 text-[13px] bg-[hsl(var(--gold))] text-white ring-4 ring-[hsl(var(--gold))]/25 shadow-md cursor-grab active:cursor-grabbing"
                        : done
                        ? "w-7 h-7 mt-0.5 text-[11px] bg-[hsl(var(--gold))] text-white"
                        : "w-7 h-7 mt-0.5 text-[11px] bg-white dark:bg-[hsl(var(--card))] text-zinc-400 dark:text-zinc-500 border-2 border-zinc-200 dark:border-white/[0.14]",
                      !isCurrent && canEdit && "hover:border-[hsl(var(--gold))] hover:text-zinc-600",
                      !canEdit && "cursor-not-allowed"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </button>

                  <span
                    className={cn(
                      "mt-2 px-1 text-center leading-tight text-[10px] sm:text-[11px] break-words hyphens-auto",
                      isCurrent
                        ? "text-zinc-900 dark:text-zinc-50 font-semibold"
                        : done
                        ? "text-zinc-500 dark:text-zinc-400"
                        : "text-zinc-400 dark:text-zinc-500",
                      isHover && !isCurrent && "text-zinc-700 dark:text-zinc-200"
                    )}
                  >
                    {s.short}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {canEdit && (
          <div className="mt-3 text-[10px] text-zinc-400 text-center">
            Clique une étape, ou fais glisser la pastille dorée
          </div>
        )}
      </div>
    </>
  );
}
