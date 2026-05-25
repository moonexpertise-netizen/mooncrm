"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { updateClient } from "./actions";

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
      } catch {
        // Rollback en cas d'erreur (rare)
        setLocalJour(jour);
        setLocalMois(mois);
      }
    });
  }

  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];

  // Style commun aux 2 selects natifs.
  // - Vide   : jaune pastel
  // - Rempli : vert pastel (cohérent avec les autres champs)
  function selectClass(filled: boolean, extra = "") {
    return cn(
      "px-2 py-1 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 transition",
      filled
        ? "bg-emerald-50/30 border-emerald-200 text-zinc-900 focus:border-emerald-400"
        : "bg-amber-50 border-amber-300 text-amber-900 focus:border-amber-400",
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
          <option value="">jour ·</option>
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
          <option value="">mois ·</option>
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
      } catch {
        setDisplay(value);
        setDraft(value ?? "");
      }
    });
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
          "w-full px-2 py-1 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 transition",
          draft.trim()
            ? "bg-emerald-50/30 border-emerald-200 text-zinc-900 focus:border-emerald-400"
            : "bg-amber-50 border-amber-300 text-amber-900 placeholder:text-amber-700/60 focus:border-amber-400"
        )}
      />
    </div>
  );
}
