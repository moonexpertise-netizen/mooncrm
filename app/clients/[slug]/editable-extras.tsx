"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import { updateClient } from "./actions";
import { initializeOnboardingForClient } from "@/app/onboarding/actions";

/**
 * Édition de la clôture standard (jour + mois) · deux selects côte à côte.
 * Optimistic UI : la nouvelle valeur s'affiche immédiatement, l'update est
 * envoyé en arrière-plan. Si erreur, on rollback silencieusement.
 */
export function ClotureSplit({
  clientId,
  jour,
  mois,
}: {
  clientId: string;
  jour: number | null;
  mois: number | null;
}) {
  const canEdit = useCan("edit_clients");
  const router = useRouter();
  const [localJour, setLocalJour] = useState<number | null>(jour);
  const [localMois, setLocalMois] = useState<number | null>(mois);
  const [, startTransition] = useTransition();

  useEffect(() => setLocalJour(jour), [jour]);
  useEffect(() => setLocalMois(mois), [mois]);

  function save(newJour: number | null, newMois: number | null) {
    setLocalJour(newJour);
    setLocalMois(newMois);
    startTransition(async () => {
      try {
        await updateClient(clientId, {
          jour_cloture: newJour,
          mois_cloture: newMois,
        });
        // La cloture impacte les echeances calculees cote serveur :
        // refresh pour propager dans la card Echeancier / matrice obligations.
        router.refresh();
      } catch (e) {
        // Rollback en cas d'erreur (rare)
        toastError(e, "Echec de la sauvegarde de la cloture");
        setLocalJour(jour);
        setLocalMois(mois);
      }
    });
  }

  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];

  if (!canEdit) {
    const txt =
      localJour != null && localMois != null
        ? `${String(localJour).padStart(2, "0")} ${months[localMois - 1] ?? ""}`.trim()
        : null;
    return (
      <div className="grid grid-cols-[140px_minmax(0,360px)] gap-2 py-1 text-sm items-center">
        <div className="text-muted-foreground">Clôture standard</div>
        <div className="px-2 py-1 rounded-md border border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 min-h-[34px] flex items-center">
          {txt ?? <span className="text-zinc-400 dark:text-zinc-500">—</span>}
        </div>
      </div>
    );
  }

  // Style commun aux 2 selects natifs (aligné avec fieldInputClass dans editable.tsx)
  function selectClass(filled: boolean, extra = "") {
    return cn(
      "px-2 py-1 rounded-md border text-sm transition-colors",
      "focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:focus:ring-white/[0.10] focus:border-zinc-400 dark:focus:border-zinc-300",
      "hover:border-zinc-300 dark:hover:border-white/[0.18]",
      filled
        ? "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100"
        : "bg-amber-50/40 dark:bg-amber-500/[0.08] border-amber-200/80 dark:border-amber-500/25 text-zinc-900 dark:text-zinc-100",
      extra
    );
  }

  return (
    <div className="grid grid-cols-[140px_minmax(0,360px)] gap-2 py-1 text-sm items-center">
      <div className="text-muted-foreground">Clôture standard</div>
      <div className="flex gap-2">
        <select
          value={localJour ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            save(v ? parseInt(v, 10) : null, localMois);
          }}
          className={selectClass(localJour != null)}
        >
          <option value="">jour</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {String(d).padStart(2, "0")}
            </option>
          ))}
        </select>
        <select
          value={localMois ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            save(localJour, v ? parseInt(v, 10) : null);
          }}
          className={selectClass(localMois != null, "flex-1")}
        >
          <option value="">mois</option>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Textarea natif toujours visible. Save au blur.
 */
export function EditableTextArea({
  clientId,
  field,
  value,
  label,
  placeholder = "- à renseigner",
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
  placeholder?: string;
}) {
  const canEdit = useCan("edit_clients");
  const [display, setDisplay] = useState(value);
  const [draft, setDraft] = useState(value ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    setDisplay(value);
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    const newValue = trimmed === "" ? null : trimmed;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue);
    startTransition(async () => {
      try {
        await updateClient(clientId, { [field]: newValue });
      } catch (e) {
        setDisplay(value);
        setDraft(value ?? "");
        toastError(e, "Echec de la sauvegarde de la note");
      }
    });
  }

  if (!canEdit) {
    return (
      <div className="py-1 text-sm max-w-[500px]">
        <div className="text-muted-foreground text-xs mb-1">{label}</div>
        <div className="w-full px-2 py-1 rounded-md border border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap min-h-[60px]">
          {display ? display : <span className="text-zinc-400 dark:text-zinc-500">{placeholder}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="py-1 text-sm max-w-[500px]">
      <div className="text-muted-foreground text-xs mb-1">{label}</div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={3}
        placeholder={placeholder}
        className={cn(
          "w-full px-2 py-1 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:border-zinc-400 transition-colors hover:border-zinc-300",
          draft.trim()
            ? "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
            : "bg-amber-50/40 border-amber-200/80 text-zinc-900 placeholder:text-amber-700/50"
        )}
      />
    </div>
  );
}

/**
 * Caractéristique tri-state "Gestion TNS" : Oui / Non / (non décidé).
 *
 * Conditionne les tâches d'onboarding TNS (Prévi TNS, Affiliation TNS).
 * À la sauvegarde, on relance `initializeOnboardingForClient` pour ajouter
 * les éventuelles tâches manquantes (idempotent : ne touche pas aux tâches
 * existantes). Si on passe de true → false, les tâches TNS déjà créées
 * restent en place - c'est volontaire (Benjamin peut les marquer N/A à la
 * main si besoin).
 */
export function EditableGestionTns({
  clientId,
  value,
  label,
}: {
  clientId: string;
  value: boolean | null;
  label: string;
}) {
  const canEdit = useCan("edit_clients");
  const router = useRouter();
  const [display, setDisplay] = useState<boolean | null>(value);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDisplay(value), [value]);

  function onChange(v: string) {
    const newValue: boolean | null =
      v === "true" ? true : v === "false" ? false : null;
    if (newValue === display) return;
    const prev = display;
    setDisplay(newValue);
    setError(null);
    startTransition(async () => {
      try {
        await updateClient(clientId, { gestion_tns: newValue });
        // Si on active TNS, créer les tâches d'onboarding TNS manquantes
        // (idempotent : ne re-crée pas ce qui existe).
        if (newValue === true) {
          await initializeOnboardingForClient(clientId);
        }
        // Refresh : impacte la matrice onboarding (taches TNS) + le hero
        // qui peut afficher TNS dans les badges. Sans cela, basculer TNS
        // ne fait apparaitre les taches qu'apres reload.
        router.refresh();
      } catch (e) {
        setDisplay(prev);
        setError(e instanceof Error ? e.message : String(e));
        toastError(e, "Echec de la sauvegarde de la gestion TNS");
      }
    });
  }

  if (!canEdit) {
    const txt = display === null ? null : display ? "Gestion TNS" : "Pas de gestion TNS";
    return (
      <div className="py-1.5 sm:py-1 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,360px)] gap-1 sm:gap-2 sm:items-center">
          <div className="text-xs sm:text-sm text-muted-foreground">{label}</div>
          <div className="min-w-0">
            <div className="w-full px-3 py-2 sm:px-2 sm:py-1 min-h-[44px] sm:min-h-[34px] rounded-md border border-zinc-100 dark:border-white/[0.06] bg-zinc-50/60 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 flex items-center">
              {txt ?? <span className="text-zinc-400 dark:text-zinc-500">—</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filled = display !== null;
  const selectClass = cn(
    "w-full px-3 py-2 sm:px-2 sm:py-1 min-h-[44px] sm:min-h-0 rounded-md border text-base sm:text-sm transition-colors hover:border-zinc-300",
    "focus:outline-none focus:ring-2 focus:ring-zinc-400/40 focus:border-zinc-400",
    filled
      ? "bg-white border-zinc-200 text-zinc-900"
      : "bg-amber-50/40 border-amber-200/80 text-zinc-900"
  );

  return (
    <div className="py-1.5 sm:py-1 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,360px)] gap-1 sm:gap-2 sm:items-center">
        <div className="text-xs sm:text-sm text-muted-foreground">{label}</div>
        <div className="min-w-0">
          <select
            value={display === null ? "" : display ? "true" : "false"}
            onChange={(e) => onChange(e.target.value)}
            className={selectClass}
          >
            <option value="">- à renseigner</option>
            <option value="true">Gestion TNS</option>
            <option value="false">Pas de gestion TNS</option>
          </select>
        </div>
      </div>
      {error && (
        <div className="text-[11px] text-rose-600 mt-0.5 sm:ml-[148px]">{error}</div>
      )}
    </div>
  );
}
