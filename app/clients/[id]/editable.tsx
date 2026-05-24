"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, fmtEuro } from "@/lib/utils";
import { setClientGroupe, updateClient } from "./actions";

/**
 * Composants d'édition inline (click-to-edit) pour la fiche client.
 *
 * Stratégie de fluidité (UX) :
 *  - Optimistic UI : la valeur saisie s'affiche INSTANTANÉMENT, sans attendre
 *    le serveur. L'utilisateur peut enchaîner les champs sans latence perçue.
 *  - Aucun signal visuel pendant le pending : pas d'opacity, pas de disabled,
 *    pas de spinner. Le revalidatePath se passe en arrière-plan.
 *  - Si l'écriture échoue, on rollback à la valeur serveur et on affiche une
 *    petite erreur rouge sous le champ. Sinon, la prop value finit par
 *    rejoindre la valeur locale après le revalidate (resync silencieux).
 */

/**
 * Synchronise une valeur locale avec la prop serveur. Quand le serveur push
 * une nouvelle valeur (après revalidate), la locale suit.
 */
function useOptimistic<T>(serverValue: T): [T, (v: T) => void, () => void] {
  const [local, setLocal] = useState<T>(serverValue);
  useEffect(() => {
    setLocal(serverValue);
  }, [serverValue]);
  return [local, setLocal, () => setLocal(serverValue)];
}

function useSaver(clientId: string, field: string) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(value: string | number | null, onError?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await updateClient(clientId, { [field]: value });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        onError?.();
      }
    });
  }
  return { save, error };
}

function FieldShell({
  label,
  children,
  error,
  className,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("py-1 text-sm", className)}>
      <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
        <div className="text-muted-foreground">{label}</div>
        <div className="min-w-0">{children}</div>
      </div>
      {error && (
        <div className="text-[11px] text-rose-600 mt-0.5 ml-[148px]">
          {error}
        </div>
      )}
    </div>
  );
}

export function EditableText({
  clientId,
  field,
  value,
  label,
  placeholder = "·",
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value ?? "");
  const { save, error } = useSaver(clientId, field);
  const ref = useRef<HTMLInputElement>(null);

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
    save(newValue, rollback);
  }

  function cancel() {
    setDraft(display ?? "");
    setEditing(false);
  }

  return (
    <FieldShell label={label} error={error}>
      {editing ? (
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") cancel();
          }}
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      ) : (
        <button
          onClick={startEdit}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition",
            !display && "bg-amber-50 text-amber-700 hover:bg-amber-100"
          )}
        >
          {display || placeholder}
        </button>
      )}
    </FieldShell>
  );
}

export function EditableNumber({
  clientId,
  field,
  value,
  label,
  unit,
  placeholder = "·",
}: {
  clientId: string;
  field: string;
  value: number | null;
  label: string;
  unit?: "eur" | "plain";
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const { save, error } = useSaver(clientId, field);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function startEdit() {
    setDraft(display != null ? String(display) : "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim().replace(",", ".");
    if (trimmed === "") {
      if (display != null) {
        setDisplay(null); // optimistic
        save(null, rollback);
      }
      return;
    }
    const n = parseFloat(trimmed);
    if (Number.isNaN(n)) {
      setDraft(display != null ? String(display) : "");
      return;
    }
    if (n !== display) {
      setDisplay(n); // optimistic
      save(n, rollback);
    }
  }

  let displayed: string = placeholder;
  if (display != null) {
    if (unit === "eur") displayed = fmtEuro(display) ?? String(display);
    else displayed = String(display);
  }

  return (
    <FieldShell label={label} error={error}>
      {editing ? (
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setDraft(display != null ? String(display) : "");
              setEditing(false);
            }
          }}
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 tabular-nums"
        />
      ) : (
        <button
          onClick={startEdit}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition tabular-nums",
            display == null && "bg-amber-50 text-amber-700 hover:bg-amber-100"
          )}
        >
          {displayed}
        </button>
      )}
    </FieldShell>
  );
}

export function EditableDate({
  clientId,
  field,
  value,
  label,
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value ?? "");
  const { save, error } = useSaver(clientId, field);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function startEdit() {
    setDraft(display ?? "");
    setEditing(true);
  }

  const displayed = display
    ? new Intl.DateTimeFormat("fr-FR").format(new Date(display))
    : "·";

  function commit() {
    setEditing(false);
    const newValue = draft || null;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue); // optimistic
    save(newValue, rollback);
  }

  return (
    <FieldShell label={label} error={error}>
      {editing ? (
        <input
          ref={ref}
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setDraft(display ?? "");
              setEditing(false);
            }
          }}
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      ) : (
        <button
          onClick={startEdit}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition",
            !display && "text-zinc-400"
          )}
        >
          {displayed}
        </button>
      )}
    </FieldShell>
  );
}

export function EditableSelect({
  clientId,
  field,
  value,
  label,
  options,
  placeholder = "·",
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
  options: readonly string[];
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay, rollback] = useOptimistic(value);
  const { save, error } = useSaver(clientId, field);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function onChange(v: string) {
    setEditing(false);
    const newValue = v || null;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue); // optimistic
    save(newValue, rollback);
  }

  return (
    <FieldShell label={label} error={error}>
      {editing ? (
        <select
          ref={ref}
          value={display ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <option value="">· (vide)</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition",
            !display && "bg-amber-50 text-amber-700 hover:bg-amber-100"
          )}
        >
          {display || placeholder}
        </button>
      )}
    </FieldShell>
  );
}

export function EditableGroupe({
  clientId,
  value,
  label,
  options,
}: {
  clientId: string;
  value: string | null;
  label: string;
  options: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value ?? "");
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

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
    setError(null);
    startTransition(async () => {
      try {
        await setClientGroupe(clientId, newValue);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        rollback();
      }
    });
  }

  const datalistId = `groupes-${clientId}`;

  return (
    <FieldShell label={label} error={error}>
      {editing ? (
        <>
          <input
            ref={ref}
            list={datalistId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") {
                setDraft(display ?? "");
                setEditing(false);
              }
            }}
            className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            placeholder="Nom du groupe (ou nouveau)"
          />
          <datalist id={datalistId}>
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      ) : (
        <button
          onClick={startEdit}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition",
            !display && "text-zinc-400"
          )}
        >
          {display || "·"}
        </button>
      )}
    </FieldShell>
  );
}

/**
 * Version "header" · édition du nom du dossier en gros, en place.
 */
export function EditableHeading({
  clientId,
  value,
}: {
  clientId: string;
  value: string;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value);
  const { save } = useSaver(clientId, "denomination");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(display), [display]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function startEdit() {
    setDraft(display);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === display) {
      setDraft(display);
      return;
    }
    setDisplay(trimmed); // optimistic
    save(trimmed, rollback);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            setDraft(display);
            setEditing(false);
          }
        }}
        className="text-3xl font-semibold tracking-tight px-2 py-0.5 -mx-2 rounded border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400 w-full max-w-xl"
      />
    );
  }
  return (
    <button
      onClick={startEdit}
      className="text-3xl font-semibold tracking-tight px-2 py-0.5 -mx-2 rounded hover:bg-zinc-100 transition text-left"
    >
      {display}
    </button>
  );
}
