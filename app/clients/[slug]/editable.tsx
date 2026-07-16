"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, fmtEuro } from "@/lib/utils";
import { toastError } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import type { Permission } from "@/lib/permissions";
import { setClientGroupe, updateClient, updateContact } from "./actions";

/**
 * Composants d'édition pour la fiche client.
 *
 * UX : champs natifs (input/select) toujours visibles, comme dans un formulaire
 * web standard. Plus de mode "click-to-edit" qui transformait un bouton en
 * input - c'était source de décalage visuel quand on hover/clique.
 *
 * Save côté serveur :
 *  - inputs : déclenché au blur (sortie du champ) ou Enter
 *  - selects : déclenché à chaque change
 *  - update optimistic immédiate (state local) puis revalidate en background
 */

// ============================================================================
//  Helpers de style - uniformes partout sur la fiche
// ============================================================================

/** Classe d'un input/select - refonte premium (Linear / Stripe style).
 *
 *  Direction design (refonte 2026) :
 *    - Vide   : fond zinc-50/60 (presque transparent) + bordure zinc-200/0 (invisible au repos)
 *    - Rempli : blanc + bordure zinc-200
 *    - Hover  : bg légèrement plus marqué + bordure zinc-300
 *    - Focus  : bg blanc + bordure zinc-900 + ring zinc-900/10 (très premium)
 *
 *  Plus aucun fond ambre/saturé. Le champ vide est juste un creux gris discret,
 *  comme dans Linear ou Notion. Le focus est marqué net (bordure foncée).
 *
 *  Mobile : min-h-[44px] (cible touch iOS HIG) + text-base (16px : empêche
 *  le zoom auto Safari sur focus d'un champ).
 */
function fieldInputClass(filled: boolean, extra = ""): string {
  return cn(
    "w-full px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[34px] rounded-lg border text-base sm:text-sm transition-all",
    // Focus : ring large semi-transparent + bordure marquee. En dark, on
    // utilise une bordure claire pour contraster avec le fond sombre.
    "focus:outline-none focus:ring-4 focus:ring-zinc-900/[0.07] dark:focus:ring-white/[0.10]",
    "focus:border-zinc-900 dark:focus:border-zinc-300 focus:bg-white dark:focus:bg-white/[0.06]",
    "hover:border-zinc-300 dark:hover:border-white/[0.16]",
    filled
      ? "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
      : "bg-zinc-50/70 dark:bg-white/[0.02] border-zinc-200/60 dark:border-white/[0.06] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
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

/**
 * Champs dont la modification impacte d'autres valeurs derivees affichees
 * dans la page (MRR, ARR calcules cote DB via trigger, libelles, etc.).
 * Pour ces champs on declenche un router.refresh() apres save pour que les
 * valeurs derivees (hero MRR/ARR notamment) se mettent a jour sans reload.
 * Les autres champs (denomination, adresse, mois_cloture...) n'ont pas
 * besoin de refresh : l'optimistic update local suffit.
 */
const DERIVED_TRIGGER_FIELDS = new Set([
  "honoraires_compta",
  "type_honos_bilans",
  "forfait_bilan",
  "type_honos_jur",
  "honoraires_jur",
  "tdb_periode",
  "tdb_honos_periode",
  "forfait_pilotage",
  "oss_periode",         // affiche/masque le bloc montant + recalcule forfait_oss
  "oss_honos_trimestre", // recalcule forfait_oss (équiv. mensuel) + MRR/ARR
  "type_honos_creation",
  "honoraires_creation",
  "type_honos_reprise",
  "honoraires_reprise",
  "exceptionnel",
  "pipeline_statut", // change le bucket clients/prospects, impacte aussi le hero badge
  "regime", // IR/IS impacte les obligations affichees
  "origine",
  "debut_obligations", // cree/desactive des subscriptions
]);

function useSaver(clientId: string, field: string) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(value: string | number | null, onError?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await updateClient(clientId, { [field]: value });
        // Refresh server-side seulement si le champ a des derives affiches
        // (MRR/ARR, badges, obligations). Sinon on evite le re-fetch pour
        // garder la saisie fluide (Benjamin tape 30 champs d'affilee).
        if (DERIVED_TRIGGER_FIELDS.has(field)) {
          router.refresh();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        // Toast d'erreur : Benjamin voit immediatement qu'une save a echoue
        // (sinon il pourrait croire que c'est sauve alors que non). Pas de
        // toast de succes pour ne pas spammer (50+ saves/jour).
        toastError(e, `Echec de la sauvegarde (${field})`);
        onError?.();
      }
    });
  }
  return { save, error };
}

/**
 * Rendu LECTURE SEULE d'un champ : même gabarit que les inputs (hauteur,
 * arrondi) mais non interactif. Utilisé quand l'utilisateur n'a pas le droit
 * d'édition correspondant. Pas de passage en édition, pas d'input.
 */
function ReadonlyValue({ value, placeholder }: { value: string | null; placeholder?: string }) {
  const filled = value != null && value !== "";
  return (
    <div
      className={cn(
        "w-full px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[34px] rounded-lg border text-base sm:text-sm flex items-center",
        "bg-zinc-50/60 dark:bg-white/[0.03] border-zinc-100 dark:border-white/[0.06]",
        filled ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-500"
      )}
    >
      {filled ? value : placeholder ?? "—"}
    </div>
  );
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
    <div className={cn("py-1.5 sm:py-1 text-sm", className)}>
      {/* Mobile : label dessus, input dessous (1 colonne). Desktop : 140px label + 360px max input. */}
      <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,360px)] gap-1 sm:gap-2 sm:items-center">
        <div className="text-xs sm:text-sm text-muted-foreground">{label}</div>
        <div className="min-w-0">{children}</div>
      </div>
      {error && (
        <div className="text-[11px] text-rose-600 mt-0.5 sm:ml-[148px]">
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
  permission = "edit_clients",
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
  placeholder?: string;
  permission?: Permission;
}) {
  const canEdit = useCan(permission);
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

  if (!canEdit) {
    return (
      <FieldShell label={label}>
        <ReadonlyValue value={display} placeholder={placeholder} />
      </FieldShell>
    );
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
  permission = "edit_clients",
}: {
  clientId: string;
  field: string;
  value: number | null;
  label: string;
  unit?: "eur" | "plain";
  placeholder?: string;
  permission?: Permission;
}) {
  const canEdit = useCan(permission);
  const [display, setDisplay, rollback] = useOptimistic(value);
  const [draft, setDraft] = useState(formatDraft(value, unit));
  const { save, error } = useSaver(clientId, field);
  const [focused, setFocused] = useState(false);

  // ⚠ Sync sur `display` (state optimistic), pas sur `value` (prop serveur).
  // Sinon : quand on blur, focused passe à false → useEffect re-trigger →
  // setDraft(value) écrase la valeur optimiste qu'on vient de saisir
  // (le serveur n'a pas encore re-fetch à ce moment-là).
  useEffect(() => {
    if (!focused) setDraft(formatDraft(display, unit));
  }, [display, unit, focused]);

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

  if (!canEdit) {
    return (
      <FieldShell label={label}>
        <ReadonlyValue value={formatDraft(display, unit) || null} placeholder={placeholder} />
      </FieldShell>
    );
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
  permission = "edit_clients",
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
  permission?: Permission;
}) {
  const canEdit = useCan(permission);
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

  if (!canEdit) {
    return (
      <FieldShell label={label}>
        <ReadonlyValue value={display} />
      </FieldShell>
    );
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
//  EditableSelect - <select> natif toujours visible
// ============================================================================

export function EditableSelect({
  clientId,
  field,
  value,
  label,
  options,
  permission = "edit_clients",
}: {
  clientId: string;
  field: string;
  value: string | null;
  label: string;
  options: readonly string[];
  placeholder?: string;
  permission?: Permission;
}) {
  const canEdit = useCan(permission);
  const [display, setDisplay, rollback] = useOptimistic(value);
  const { save, error } = useSaver(clientId, field);

  function onChange(v: string) {
    const newValue = v || null;
    if (newValue === (display ?? null)) return;
    setDisplay(newValue);
    save(newValue, rollback);
  }

  if (!canEdit) {
    return (
      <FieldShell label={label}>
        <ReadonlyValue value={display} />
      </FieldShell>
    );
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
//  EditableGroupe - input texte avec datalist (autocomplete) toujours visible
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
  const canEdit = useCan("edit_clients");
  const router = useRouter();
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
        // Refresh server-side : on a peut-etre cree un nouveau groupe, et
        // l'affichage du groupe dans le hero (badge a cote de la denomination)
        // doit refleter le changement sans reload.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        toastError(e, "Echec de la sauvegarde du groupe");
        rollback();
      }
    });
  }

  const datalistId = `groupes-${clientId}`;

  if (!canEdit) {
    return (
      <FieldShell label={label}>
        <ReadonlyValue value={display} />
      </FieldShell>
    );
  }

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
  const canEdit = useCan("edit_clients");
  const router = useRouter();
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
        // Refresh : le hero "Dirigeant" et les boutons LDM/Signature
        // utilisent la prop client/contact rendue serveur. Sans refresh,
        // ils restent avec l'ancien nom / email apres edit ici.
        router.refresh();
      } catch (e) {
        rollback();
        setError(e instanceof Error ? e.message : String(e));
        toastError(e, "Echec de la sauvegarde du contact");
      }
    });
  }

  if (!canEdit) {
    return (
      <FieldShell label={label}>
        <ReadonlyValue value={display} placeholder={placeholder} />
      </FieldShell>
    );
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
//  EditableContactCivilite - <select> natif toujours visible
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
  const canEdit = useCan("edit_clients");
  const router = useRouter();
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
        // Civilite affichee dans le hero (LDM/Signature buttons + nom
        // complet). Sans refresh, le hero garde l'ancienne civilite.
        router.refresh();
      } catch (e) {
        rollback();
        setError(e instanceof Error ? e.message : String(e));
        toastError(e, "Echec de la sauvegarde de la civilite");
      }
    });
  }

  if (!canEdit) {
    const labelMap: Record<string, string> = {
      "M.": "Monsieur",
      Mme: "Madame",
      Mlle: "Mademoiselle",
    };
    return (
      <FieldShell label={label}>
        <ReadonlyValue value={display ? labelMap[display] ?? display : null} />
      </FieldShell>
    );
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
//  EditableHeading - titre du dossier en gros, en mode "click to edit"
//  (un input toujours visible serait trop intrusif sur le titre principal)
// ============================================================================

export function EditableHeading({
  clientId,
  value,
}: {
  clientId: string;
  value: string;
}) {
  const canEdit = useCan("edit_clients");
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

  if (!canEdit) {
    return (
      <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {display}
      </h1>
    );
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
        className="font-display text-3xl md:text-4xl font-semibold tracking-tight px-2 py-0.5 -mx-2 rounded-lg border border-zinc-300 bg-white dark:border-white/[0.16] dark:bg-white/[0.04] dark:text-zinc-100 focus:outline-none focus:ring-4 focus:ring-zinc-900/[0.07] dark:focus:ring-white/[0.10] focus:border-zinc-900 dark:focus:border-zinc-300 w-full max-w-2xl"
      />
    );
  }
  return (
    <button
      onClick={startEdit}
      className="font-display text-3xl md:text-4xl font-semibold tracking-tight px-2 py-0.5 -mx-2 rounded-lg hover:bg-zinc-100/70 transition text-left text-zinc-900"
    >
      {display}
    </button>
  );
}
