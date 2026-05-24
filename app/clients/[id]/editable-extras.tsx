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

  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm items-center">
      <div className="text-muted-foreground">Clôture standard</div>
      <div className="flex gap-2">
        <select
          value={localJour ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            save(v ? parseInt(v, 10) : null, localMois);
          }}
          className={cn(
            "px-2 py-1 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400",
            localJour == null
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-white border-zinc-300"
          )}
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
          className={cn(
            "px-2 py-1 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 flex-1",
            localMois == null
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-white border-zinc-300"
          )}
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
 * Textarea inline. Affiche la valeur en gris cliquable, ouvre un éditeur sur clic.
 * Optimistic UI : la nouvelle valeur s'affiche dès le blur, sans signal d'attente.
 */
export function EditableTextArea({
  clientId,
  field,
  value,
  label,
  placeholder = "Cliquer pour saisir…",
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay] = useState(value);
  const [draft, setDraft] = useState(value ?? "");
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDisplay(value), [value]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function startEdit() {
    setDraft(display ?? "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const newValue = trimmed === "" ? null : trimmed;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue); // optimistic
    startTransition(async () => {
      try {
        await updateClient(clientId, { [field]: newValue });
      } catch {
        setDisplay(value); // rollback
      }
    });
  }

  return (
    <div className="py-1 text-sm">
      <div className="text-muted-foreground text-xs mb-1">{label}</div>
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
            else if (e.key === "Escape") {
              setDraft(display ?? "");
              setEditing(false);
            }
          }}
          rows={3}
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      ) : (
        <button
          onClick={startEdit}
          className={cn(
            "w-full text-left px-2 py-1.5 rounded -mx-2 hover:bg-zinc-100 transition whitespace-pre-wrap min-h-[2.5rem]",
            !display && "bg-amber-50 text-amber-700 hover:bg-amber-100"
          )}
        >
          {display || placeholder}
        </button>
      )}
    </div>
  );
}
