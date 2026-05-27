"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, statutColorClass } from "@/lib/utils";
import { addOnboardingStatusOption, updateOnboardingTaskStatus } from "@/app/onboarding/actions";

export type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

export type OnboardingStatusOption = {
  libelle: string;
  statut_logique: StatutLogique;
  color: string | null;
};

export type OnboardingTask = {
  id: string;
  task_key: string;
  categorie: string;
  statut_logique: StatutLogique;
  statut_detail: string | null;
  /** Libellé humain de la tâche (calculé côté serveur depuis ONBOARDING_LABEL) */
  label: string;
};

const STATUT_GROUP_ORDER: StatutLogique[] = ["A_FAIRE", "EN_COURS", "TERMINE", "NON_APPLICABLE"];
const STATUT_GROUP_LABEL: Record<StatutLogique, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  NON_APPLICABLE: "N/A",
};

/**
 * Édition inline des tâches d'onboarding (style tracker production).
 *
 * Chaque ligne = 1 tâche. Click sur la pastille statut → popover groupé par
 * statut_logique. Optimistic update.
 */
export default function OnboardingEditor({
  tasks,
  optionsByKey,
  numbered = false,
}: {
  tasks: OnboardingTask[];
  optionsByKey: Record<string, OnboardingStatusOption[]>;
  /** Affiche un préfixe numéroté (1, 2, 3…) devant chaque tâche. */
  numbered?: boolean;
}) {
  type Patch = {
    taskId: string;
    statut_logique?: StatutLogique;
    statut_detail?: string | null;
  };

  // State local + sync via prop : pattern fiable, useOptimistic ne joue pas
  // bien avec router.refresh() (reverts à la fin de la transition, le
  // refresh n'a pas encore propagé la nouvelle donnée serveur → on retombe
  // sur l'ancien statut). Cf. editable.tsx qui utilise exactement ce pattern.
  const [localTasks, setLocalTasks] = useState<OnboardingTask[]>(tasks);
  useEffect(() => setLocalTasks(tasks), [tasks]);

  function applyPatch(patch: Patch) {
    setLocalTasks((state) =>
      state.map((t) =>
        t.id === patch.taskId
          ? {
              ...t,
              statut_logique:
                patch.statut_logique !== undefined ? patch.statut_logique : t.statut_logique,
              statut_detail:
                patch.statut_detail !== undefined ? patch.statut_detail : t.statut_detail,
            }
          : t
      )
    );
  }

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function onPick(taskId: string, libelle: string, statut_logique: StatutLogique) {
    applyPatch({ taskId, statut_logique, statut_detail: libelle });
    setOpenTaskId(null);
    startTransition(async () => {
      await updateOnboardingTaskStatus(taskId, libelle);
      router.refresh();
    });
  }

  function onReset(taskId: string) {
    applyPatch({ taskId, statut_logique: "A_FAIRE", statut_detail: null });
    setOpenTaskId(null);
    startTransition(async () => {
      await updateOnboardingTaskStatus(taskId, null);
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-zinc-100">
      {localTasks.map((t, i) => (
        <TaskRow
          key={t.id}
          task={t}
          index={numbered ? i + 1 : null}
          options={optionsByKey[t.task_key] ?? []}
          isOpen={openTaskId === t.id}
          onOpen={() => setOpenTaskId(t.id)}
          onClose={() => setOpenTaskId(null)}
          onPick={(libelle, sl) => onPick(t.id, libelle, sl)}
          onReset={() => onReset(t.id)}
        />
      ))}
    </div>
  );
}

// ============================================================================
//  TaskRow : 1 ligne par tâche
// ============================================================================

function TaskRow({
  task,
  index,
  options,
  isOpen,
  onOpen,
  onClose,
  onPick,
  onReset,
}: {
  task: OnboardingTask;
  /** Si non null, affiche le numéro d'ordre devant le libellé. */
  index: number | null;
  options: OnboardingStatusOption[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (libelle: string, statut_logique: StatutLogique) => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen || !ref.current) {
      setPos(null);
      return;
    }
    const btn = ref.current.querySelector("button[data-status-button]");
    if (!btn) return;
    const rect = (btn as HTMLElement).getBoundingClientRect();
    const POPOVER_HEIGHT = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow;
    setPos({
      left: rect.right - 20,
      top: openUp ? rect.top : rect.bottom,
      openUp,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  const matchedOption = options.find((o) => o.libelle === task.statut_detail);
  const colorClass = statutColorClass(task.statut_logique, matchedOption?.color);
  const defaultLibelle = options.find((o) => o.statut_logique === "A_FAIRE")?.libelle ?? "-";

  const grouped = useMemo(() => {
    const groups: Record<StatutLogique, OnboardingStatusOption[]> = {
      A_FAIRE: [],
      EN_COURS: [],
      TERMINE: [],
      NON_APPLICABLE: [],
    };
    for (const o of options) groups[o.statut_logique].push(o);
    return groups;
  }, [options]);

  return (
    <div className="relative flex items-center justify-between gap-2 py-2 px-1" ref={ref}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {index !== null && (
          <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-semibold tabular-nums">
            {index}
          </span>
        )}
        <span className="text-sm font-medium text-zinc-800 truncate">{task.label}</span>
      </div>
      <button
        type="button"
        data-status-button="1"
        onClick={onOpen}
        className={cn(
          "px-2 py-1 rounded-md text-[11px] font-medium border max-w-[180px] truncate transition-all hover:opacity-80 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] focus-visible:ring-offset-1",
          colorClass
        )}
      >
        {task.statut_detail ?? defaultLibelle}
      </button>

      {isOpen && pos && (
        <div
          style={{
            position: "fixed",
            left: `${pos.left}px`,
            top: `${pos.top}px`,
            transform: pos.openUp
              ? "translate(-100%, calc(-100% - 8px))"
              : "translate(-100%, 8px)",
            zIndex: 1000,
          }}
          className="bg-white dark:bg-[hsl(var(--surface-elevated))] border dark:border-white/[0.10] rounded-lg shadow-xl min-w-[260px] text-left animate-slide-up-fade overflow-hidden"
        >
          {/* Statut actuel en haut */}
          <div className="px-3 py-2 border-b dark:border-white/[0.06]">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Statut actuel</div>
            <span className={cn("inline-block px-2 py-0.5 rounded-md text-[11px] font-medium border", colorClass)}>
              {task.statut_detail ?? defaultLibelle}
            </span>
          </div>

          {/* Groupes par statut_logique */}
          <div className="max-h-[300px] overflow-y-auto py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                Pas de libellés disponibles. Crée-en un ci-dessous ↓
              </div>
            ) : (
              STATUT_GROUP_ORDER.map((groupKey) => {
                const opts = grouped[groupKey];
                if (opts.length === 0) return null;
                return (
                  <div key={groupKey} className="py-0.5">
                    <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-zinc-400 font-medium">
                      {STATUT_GROUP_LABEL[groupKey]}
                    </div>
                    {opts.map((opt) => (
                      <button
                        key={opt.libelle}
                        onClick={() => onPick(opt.libelle, opt.statut_logique)}
                        className={cn(
                          "w-full text-left px-3 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors",
                          task.statut_detail === opt.libelle && "bg-zinc-50 dark:bg-white/[0.04]"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap",
                            statutColorClass(opt.statut_logique, opt.color)
                          )}
                        >
                          {opt.libelle}
                        </span>
                        {task.statut_detail === opt.libelle && (
                          <span className="text-zinc-400 ml-auto text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Création inline d'une nouvelle option (style Notion) */}
          <CreateOptionForm
            taskKey={task.task_key}
            onCreated={(libelle, statut_logique) => onPick(libelle, statut_logique)}
          />

          {/* Footer : reset */}
          {task.statut_detail && (
            <div className="border-t dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              <button
                onClick={onReset}
                className="w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Réinitialiser
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  CreateOptionForm — création inline d'un nouveau libellé (style Notion).
//  Affiché en bas du popover statut. L'utilisateur tape un texte, choisit
//  un bucket (À faire / En cours / Terminé / N/A) et le libellé est créé.
//  Après création, le statut de la tâche est immédiatement appliqué.
// ============================================================================

function CreateOptionForm({
  taskKey,
  onCreated,
}: {
  taskKey: string;
  onCreated: (libelle: string, statut_logique: StatutLogique) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(statut_logique: StatutLogique) {
    const trimmed = draft.trim();
    if (!trimmed || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        await addOnboardingStatusOption(taskKey, trimmed, statut_logique);
        setDraft("");
        // Applique le nouveau libellé comme statut courant (optimistic).
        onCreated(trimmed, statut_logique);
        // Re-fetch des options server-side (la prop optionsByKey vient du serveur).
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="border-t dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.02] px-3 py-2.5 space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">
        Créer une option
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Nom du libellé…"
        disabled={isPending}
        className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:focus:ring-white/15 focus:border-zinc-400 dark:focus:border-zinc-300 disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit("A_FAIRE"); // Enter = A faire par défaut
        }}
      />
      {draft.trim() && (
        <div className="space-y-1">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Ajouter à :
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUT_GROUP_ORDER.map((g) => (
              <button
                key={g}
                onClick={() => submit(g)}
                disabled={isPending}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-medium border transition-colors",
                  "hover:bg-zinc-100 dark:hover:bg-white/[0.08]",
                  "disabled:opacity-50",
                  statutColorClass(g, null)
                )}
              >
                {STATUT_GROUP_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="text-[10px] text-rose-600 dark:text-rose-400">{error}</div>
      )}
    </div>
  );
}
