"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, fmtEuro } from "@/lib/utils";
import { setClientGroupe, updateClient, updateContact } from "./actions";

/**
 * Composants d'édition pour la fiche client.
 *
 * UX : champs natifs (input/select) toujours visibles, comme dans un formulaire
 * web standard. Plus de mode "click-to-edit" qui transformait un bouton en
 * input — c'était source de décalage visuel quand on hover/clique.
 *
 * Save côté serveur :
 *  - inputs : déclenché au blur (sortie du champ) ou Enter
 *  - selects : déclenché à chaque change
 *  - update optimistic immédiate (state local) puis revalidate en background
 */

// ============================================================================
//  Helpers de style — uniformes partout sur la fiche
// ============================================================================

/** Classe d'un input/select.
 *  - Vide    : fond jaune pastel + bordure amber (signale qu'il faut remplir)
 *  - Rempli  : fond vert pastel + bordure emerald (signale "OK, saisi")
 */
function fieldInputClass(filled: boolean, extra = ""): string {
  return cn(
    "w-full px-2 py-1 rounded border text-sm transition focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30",
    filled
      ? "bg-emerald-50/30 border-emerald-200 text-zinc-900 focus:border-emerald-400"
      : "bg-amber-50 border-amber-300 text-amber-900 placeholder:text-amber-700/60 focus:border-amber-400",
    extra
  );
}

// ============================================================================
//  Hooks internes
// ============================================================================

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
      <div className="grid grid-cols-[140px_minmax(0,360px)] gap-2 items-center">
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

// ============================================================================
//  EditableText
// ============================================================================

export function EditableText({
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
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value ?? "");
  const { save, error } = useSaver(clientId, field);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    const newValue = trimmed === "" ? null : trimmed;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue);
    save(newValue, rollback);
  }

  return (
    <FieldShell label={label} error={error}>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
        className={fieldInputClass(draft.trim() !== "")}
      />
    </FieldShell>
  );
}

// ============================================================================
//  EditableNumber
// ============================================================================

export function EditableNumber({
  clientId,
  field,
  value,
  label,
  unit,
  placeholder = "- à renseigner",
}: {
  clientId: string;
  field: string;
  value: number | null;
  label: string;
  unit?: "eur" | "plain";
  placeholder?: string;
}) {
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(formatDraft(value, unit));
  const { save, error } = useSaver(clientId, field);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatDraft(value, unit));
  }, [value, unit, focused]);

  function commit() {
    setFocused(false);
    const trimmed = draft.trim().replace(/[€\s]/g, "").replace(",", ".");
    if (trimmed === "") {
      if (display != null) {
        setDisplay(null);
        save(null, rollback);
      }
      setDraft(formatDraft(null, unit));
      return;
    }
    const n = parseFloat(trimmed);
    if (Number.isNaN(n)) {
      setDraft(formatDraft(display, unit));
      return;
    }
    if (n !== display) {
      setDisplay(n);
      save(n, rollback);
    }
    setDraft(formatDraft(n, unit));
  }

  return (
    <FieldShell label={label} error={error}>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          setFocused(true);
          setDraft(display != null ? String(display) : "");
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
        className={fieldInputClass(display != null, "tabular-nums")}
      />
    </FieldShell>
  );
}

function formatDraft(v: number | null, unit?: "eur" | "plain"): string {
  if (v == null) return "";
  if (unit === "eur") return fmtEuro(v) ?? String(v);
  return String(v);
}

// ============================================================================
//  EditableDate
// ============================================================================

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
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value ?? "");
  const { save, error } = useSaver(clientId, field);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit(next: string) {
    const newValue = next || null;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue);
    save(newValue, rollback);
  }

  return (
    <FieldShell label={label} error={error}>
      <input
        type="date"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        className={fieldInputClass(draft !== "")}
      />
    </FieldShell>
  );
}

// ============================================================================
//  EditableSelect — <select> natif toujours visible
// ============================================================================

export function EditableSelect({
  clientId,
  field,
  value,
  label,
  options,
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
  options: readonly string[];
  placeholder?: string;
}) {
  const [display, setDisplay, rollback] = useOptimistic(value);
  const { save, error } = useSaver(clientId, field);

  function onChange(v: string) {
    const newValue = v || null;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue);
    save(newValue, rollback);
  }

  return (
    <FieldShell label={label} error={error}>
      <select
        value={display ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInputClass(!!display)}
      >
        <option value="">- à renseigner</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

// ============================================================================
//  EditableGroupe — input texte avec datalist (autocomplete) toujours visible
// ============================================================================

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
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value ?? "");
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    const newValue = trimmed === "" ? null : trimmed;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue);
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
      <input
        type="text"
        list={datalistId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="- à renseigner"
        className={fieldInputClass(draft.trim() !== "")}
      />
      <datalist id={datalistId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </FieldShell>
  );
}

// ============================================================================
//  EditableContactText (édite contacts.{prenom|nom|email|telephone})
// ============================================================================

export function EditableContactText({
  contactId,
  field,
  value,
  label,
  placeholder = "- à renseigner",
  required = false,
}: {
  contactId: string;
  field: "prenom" | "nom" | "email" | "telephone";
  value: string | null;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(value ?? "");
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    if (required && !trimmed) {
      setDraft(display ?? "");
      return;
    }
    const newValue = trimmed === "" ? null : trimmed;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue);
    setError(null);
    startTransition(async () => {
      try {
        await updateContact(contactId, { [field]: newValue });
      } catch (e) {
        rollback();
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <FieldShell label={label} error={error}>
      <input
        type={field === "email" ? "email" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
        className={fieldInputClass(draft.trim() !== "")}
      />
    </FieldShell>
  );
}

// ============================================================================
//  EditableContactCivilite — <select> natif toujours visible
// ============================================================================

export function EditableContactCivilite({
  contactId,
  value,
  label,
}: {
  contactId: string;
  value: "M." | "Mme" | "Mlle" | null;
  label: string;
}) {
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(v: string) {
    const newValue = (v || null) as "M." | "Mme" | "Mlle" | null;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue);
    setError(null);
    startTransition(async () => {
      try {
        await updateContact(contactId, { civilite: newValue });
      } catch (e) {
        rollback();
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <FieldShell label={label} error={error}>
      <select
        value={display ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInputClass(!!display)}
      >
        <option value="">- à renseigner</option>
        <option value="M.">Monsieur</option>
        <option value="Mme">Madame</option>
        <option value="Mlle">Mademoiselle</option>
      </select>
    </FieldShell>
  );
}

// ============================================================================
//  EditableHeading — titre du dossier en gros, en mode "click to edit"
//  (un input toujours visible serait trop intrusif sur le titre principal)
// ============================================================================

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
    setDisplay(trimmed);
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
