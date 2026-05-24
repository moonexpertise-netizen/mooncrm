"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, fmtEuro } from "@/lib/utils";
import { setClientGroupe, updateClient } from "./actions";

/**
 * Composants d'édition inline (click-to-edit) pour la fiche client.
 * - EditableText : input texte, sauvegarde sur blur ou Enter
 * - EditableNumber : input numérique
 * - EditableDate : input date HTML5
 * - EditableSelect : dropdown avec valeurs prédéfinies
 * - EditableGroupe : autocomplete avec création à la volée
 *
 * Le parent passe le clientId, le nom du champ et la valeur courante. On gère
 * l'état local d'édition + l'appel server action + le refresh.
 */

function useSaver(clientId: string, field: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function save(value: string | number | null) {
    startTransition(async () => {
      await updateClient(clientId, { [field]: value });
    });
  }
  return { save, isPending };
}

function FieldShell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[140px_1fr] gap-2 py-1 text-sm items-center", className)}>
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
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
  const [draft, setDraft] = useState(value ?? "");
  const { save, isPending } = useSaver(clientId, field);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) return;
    save(trimmed === "" ? null : trimmed);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  return (
    <FieldShell label={label}>
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
          onClick={() => setEditing(true)}
          disabled={isPending}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition",
            !value && "bg-amber-50 text-amber-700 hover:bg-amber-100",
            isPending && "opacity-60"
          )}
        >
          {value || placeholder}
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
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const { save, isPending } = useSaver(clientId, field);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim().replace(",", ".");
    if (trimmed === "") {
      if (value != null) save(null);
      return;
    }
    const n = parseFloat(trimmed);
    if (Number.isNaN(n)) {
      setDraft(value != null ? String(value) : "");
      return;
    }
    if (n !== value) save(n);
  }

  let displayed: string = placeholder;
  if (value != null) {
    if (unit === "eur") displayed = fmtEuro(value) ?? String(value);
    else displayed = String(value);
  }

  return (
    <FieldShell label={label}>
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
              setDraft(value != null ? String(value) : "");
              setEditing(false);
            }
          }}
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 tabular-nums"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          disabled={isPending}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition tabular-nums",
            value == null && "bg-amber-50 text-amber-700 hover:bg-amber-100",
            isPending && "opacity-60"
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
  const [draft, setDraft] = useState(value ?? "");
  const { save, isPending } = useSaver(clientId, field);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const displayed = value
    ? new Intl.DateTimeFormat("fr-FR").format(new Date(value))
    : "·";

  function commit() {
    setEditing(false);
    if (draft === (value ?? "")) return;
    save(draft || null);
  }

  return (
    <FieldShell label={label}>
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
              setDraft(value ?? "");
              setEditing(false);
            }
          }}
          className="w-full px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          disabled={isPending}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition",
            !value && "text-zinc-400",
            isPending && "opacity-60"
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
  const { save, isPending } = useSaver(clientId, field);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function onChange(v: string) {
    setEditing(false);
    save(v || null);
  }

  return (
    <FieldShell label={label}>
      {editing ? (
        <select
          ref={ref}
          value={value ?? ""}
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
          disabled={isPending}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition",
            !value && "bg-amber-50 text-amber-700 hover:bg-amber-100",
            isPending && "opacity-60"
          )}
        >
          {value || placeholder}
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
  const [draft, setDraft] = useState(value ?? "");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) return;
    startTransition(async () => {
      await setClientGroupe(clientId, trimmed || null);
    });
  }

  const datalistId = `groupes-${clientId}`;

  return (
    <FieldShell label={label}>
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
                setDraft(value ?? "");
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
          onClick={() => setEditing(true)}
          disabled={isPending}
          className={cn(
            "w-full text-left px-2 py-1 rounded -mx-2 hover:bg-zinc-100 transition",
            !value && "text-zinc-400",
            isPending && "opacity-60"
          )}
        >
          {value || "·"}
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
  const [draft, setDraft] = useState(value);
  const { save, isPending } = useSaver(clientId, "denomination");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      return;
    }
    save(trimmed);
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
            setDraft(value);
            setEditing(false);
          }
        }}
        className="text-3xl font-semibold tracking-tight px-2 py-0.5 -mx-2 rounded border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400 w-full max-w-xl"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      disabled={isPending}
      className={cn(
        "text-3xl font-semibold tracking-tight px-2 py-0.5 -mx-2 rounded hover:bg-zinc-100 transition text-left",
        isPending && "opacity-60"
      )}
    >
      {value}
    </button>
  );
}
