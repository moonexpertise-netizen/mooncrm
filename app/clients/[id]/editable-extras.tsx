"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { updateClient } from "./actions";

/**
 * Édition de la clôture standard (jour + mois) · deux selects côte à côte.
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function save(newJour: number | null, newMois: number | null) {
    startTransition(async () => {
      await updateClient(clientId, {
        jour_cloture: newJour,
        mois_cloture: newMois,
      });
    });
  }

  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];

  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm items-center">
      <div className="text-muted-foreground">Clôture standard</div>
      <div className={cn("flex gap-2", isPending && "opacity-60")}>
        <select
          value={jour ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            save(v ? parseInt(v, 10) : null, mois);
          }}
          className={cn(
            "px-2 py-1 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400",
            jour == null
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
          value={mois ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            save(jour, v ? parseInt(v, 10) : null);
          }}
          className={cn(
            "px-2 py-1 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 flex-1",
            mois == null
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
  const [draft, setDraft] = useState(value ?? "");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(value ?? ""), [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) return;
    startTransition(async () => {
      await updateClient(clientId, { [field]: trimmed === "" ? null : trimmed });
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
              setDraft(value ?? "");
              setEditing(false);
            }
          }}
          rows={3}
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          disabled={isPending}
          className={cn(
            "w-full text-left px-2 py-1.5 rounded -mx-2 hover:bg-zinc-100 transition whitespace-pre-wrap min-h-[2.5rem]",
            !value && "bg-amber-50 text-amber-700 hover:bg-amber-100",
            isPending && "opacity-60"
          )}
        >
          {value || placeholder}
        </button>
      )}
    </div>
  );
}
