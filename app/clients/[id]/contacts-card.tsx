"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  addContactToClient,
  removeContactFromClient,
  updateContact,
  updateContactRole,
} from "./actions";

export type ContactRow = {
  contactId: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  civilite: "M." | "Mme" | "Mlle" | null;
  role: string | null;
};

export default function ContactsCard({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ContactRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-700">
          Contacts ({contacts.length})
        </h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-2.5 py-1 rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400 transition"
          >
            + Ajouter
          </button>
        )}
      </div>

      {contacts.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">Aucun contact rattaché.</p>
      )}

      <ul className="space-y-1">
        {contacts.map((c) => (
          <ContactRowItem key={c.contactId} clientId={clientId} row={c} />
        ))}
      </ul>

      {adding && (
        <NewContactForm
          clientId={clientId}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function ContactRowItem({ clientId, row }: { clientId: string; row: ContactRow }) {
  const [, startTransition] = useTransition();

  // Optimistic display : on garde un état local de la row qui prime sur la prop
  // jusqu'au prochain revalidate. La saisie semble instantanée.
  const [display, setDisplay] = useState<ContactRow>(row);
  useEffect(() => setDisplay(row), [row]);

  function commit(field: "prenom" | "nom" | "email" | "telephone" | "role", value: string) {
    const v = value.trim();
    // Optimistic update local + rollback si erreur
    const previous = display;
    const next: ContactRow = { ...display };
    if (field === "nom") {
      if (!v) return;
      next.nom = v;
    } else if (field === "prenom") {
      next.prenom = v || null;
    } else if (field === "email") {
      next.email = v || null;
    } else if (field === "telephone") {
      next.telephone = v || null;
    } else if (field === "role") {
      next.role = v || null;
    }
    setDisplay(next);

    startTransition(async () => {
      try {
        if (field === "role") {
          await updateContactRole(clientId, row.contactId, v || null);
        } else if (field === "nom") {
          await updateContact(row.contactId, { nom: v });
        } else if (field === "prenom") {
          await updateContact(row.contactId, { prenom: v || null });
        } else if (field === "email") {
          await updateContact(row.contactId, { email: v || null });
        } else if (field === "telephone") {
          await updateContact(row.contactId, { telephone: v || null });
        }
      } catch (e) {
        setDisplay(previous); // rollback
        alert((e as Error).message);
      }
    });
  }

  function onRemove() {
    if (!confirm(`Détacher ${display.nom} de ce dossier ?`)) return;
    startTransition(async () => {
      try {
        await removeContactFromClient(clientId, row.contactId);
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  function commitCivilite(v: "M." | "Mme" | "Mlle" | null) {
    const previous = display;
    setDisplay({ ...display, civilite: v });
    startTransition(async () => {
      try {
        await updateContact(row.contactId, { civilite: v });
      } catch (e) {
        setDisplay(previous); // rollback
        alert((e as Error).message);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-zinc-50 group">
      <CivilitePicker value={display.civilite} onChange={commitCivilite} />
      <InlineField
        value={display.prenom ?? ""}
        placeholder="Prénom"
        onCommit={(v) => commit("prenom", v)}
        className="text-sm min-w-[80px]"
      />
      <InlineField
        value={display.nom}
        placeholder="Nom"
        onCommit={(v) => commit("nom", v)}
        className="font-medium min-w-[80px]"
      />
      <InlineField
        value={display.role ?? ""}
        placeholder="Rôle"
        onCommit={(v) => commit("role", v)}
        className="text-xs"
      />
      <InlineField
        value={display.email ?? ""}
        placeholder="Email"
        onCommit={(v) => commit("email", v)}
        className="text-xs"
        type="email"
      />
      <InlineField
        value={display.telephone ?? ""}
        placeholder="Téléphone"
        onCommit={(v) => commit("telephone", v)}
        className="text-xs tabular-nums"
      />
      <button
        onClick={onRemove}
        className="ml-auto opacity-0 group-hover:opacity-100 transition text-xs text-zinc-400 hover:text-rose-600 px-1.5"
        title="Détacher du dossier"
      >
        ✕
      </button>
    </li>
  );
}

/** Sélecteur compact de civilité — chip M./Mme cliquable qui cycle. */
function CivilitePicker({
  value,
  onChange,
}: {
  value: "M." | "Mme" | "Mlle" | null;
  onChange: (v: "M." | "Mme" | "Mlle" | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const opts: Array<"M." | "Mme" | "Mlle"> = ["M.", "Mme", "Mlle"];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "px-1.5 py-0.5 rounded text-xs font-medium border transition shrink-0",
          value
            ? "bg-emerald-50/30 border-emerald-200 text-zinc-900 hover:border-emerald-400"
            : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
        )}
        title="Civilité"
      >
        {value ?? "Civ."}
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-white border rounded-md shadow-lg py-0.5 min-w-[80px]">
          {opts.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-2 py-1 text-xs hover:bg-zinc-100 transition",
                value === o && "font-medium text-[hsl(var(--gold-dark))]"
              )}
            >
              {o}
            </button>
          ))}
          {value && (
            <>
              <div className="h-px bg-zinc-200 my-0.5" />
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 transition"
              >
                - à renseigner
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Input natif toujours visible (plus de click-to-edit). Save au blur.
 */
function InlineField({
  value,
  placeholder,
  onCommit,
  className,
  type = "text",
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
  className?: string;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      className={cn(
        "px-1.5 py-0.5 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 transition",
        draft.trim()
          ? "bg-emerald-50/30 border-emerald-200 text-zinc-900 focus:border-emerald-400"
          : "bg-amber-50 border-amber-300 text-amber-900 placeholder:text-amber-700/60 focus:border-amber-400",
        className
      )}
      style={{ minWidth: "120px" }}
    />
  );
}

function NewContactForm({
  clientId,
  onDone,
  onCancel,
}: {
  clientId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [civilite, setCivilite] = useState<"M." | "Mme" | "Mlle" | null>(null);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    // Validation : civilité + prénom + nom obligatoires (alimentent la lettre
    // de mission). Email + tel nécessaires pour la signature électronique mais
    // pas bloquants à la création.
    const missing: string[] = [];
    if (!civilite) missing.push("Civilité");
    if (!prenom.trim()) missing.push("Prénom");
    if (!nom.trim()) missing.push("Nom");
    if (missing.length > 0) {
      setError(`Champ${missing.length > 1 ? "s" : ""} obligatoire${missing.length > 1 ? "s" : ""} : ${missing.join(", ")}.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addContactToClient(clientId, {
          nom: nom.trim(),
          prenom: prenom.trim() || null,
          email: email.trim() || null,
          telephone: telephone.trim() || null,
          role: role.trim() || null,
          civilite,
        });
        onDone();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="mt-3 p-4 rounded-md border border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/5 space-y-3 animate-slide-up-fade">
      {/* Identité — obligatoire pour la lettre de mission */}
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wide font-medium text-zinc-600">
          Identité <span className="text-rose-500 normal-case font-normal">· obligatoire pour la LDM</span>
        </div>
        <div>
          <label className="text-[11px] text-zinc-600 mb-1 block">
            Civilité <span className="text-rose-500">*</span>
          </label>
          <div className="flex items-center gap-1">
            {(["M.", "Mme", "Mlle"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCivilite(civilite === c ? null : c)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium border transition",
                  civilite === c
                    ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))]"
                    : civilite === null
                    ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                    : "bg-white border-zinc-300 text-zinc-600 hover:border-zinc-400"
                )}
              >
                {c === "M." ? "Monsieur" : c === "Mme" ? "Madame" : "Mademoiselle"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-zinc-600 mb-1 block">
              Prénom <span className="text-rose-500">*</span>
            </span>
            <input
              autoFocus
              type="text"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="ex. Benjamin"
              className={cn(
                "w-full px-2 py-1.5 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60",
                prenom.trim() ? "border-zinc-300 bg-white" : "border-amber-300 bg-amber-50"
              )}
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-600 mb-1 block">
              Nom <span className="text-rose-500">*</span>
            </span>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex. PEREZ"
              className={cn(
                "w-full px-2 py-1.5 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60",
                nom.trim() ? "border-zinc-300 bg-white" : "border-amber-300 bg-amber-50"
              )}
            />
          </label>
        </div>
      </div>

      {/* Coordonnées — requises pour la signature électronique JeSignExpert */}
      <div className="space-y-2 pt-2 border-t border-[hsl(var(--gold))]/20">
        <div className="text-[11px] uppercase tracking-wide font-medium text-zinc-600">
          Coordonnées <span className="text-zinc-400 normal-case font-normal">· pour la signature électronique</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-zinc-600 mb-1 block">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@…"
              className="w-full px-2 py-1.5 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-600 mb-1 block">Téléphone</span>
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="06…"
              className="w-full px-2 py-1.5 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60 tabular-nums"
            />
          </label>
        </div>
      </div>

      {/* Rôle — facultatif */}
      <div className="space-y-2 pt-2 border-t border-[hsl(var(--gold))]/20">
        <label className="block">
          <span className="text-[11px] text-zinc-600 mb-1 block">
            Rôle <span className="text-zinc-400">· facultatif</span>
          </span>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="ex. Président, Dirigeant, Comptable…"
            className="w-full px-2 py-1.5 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2 justify-end pt-1">
        <button
          onClick={onCancel}
          disabled={isPending}
          className="text-xs px-2.5 py-1.5 rounded-md text-zinc-600 hover:text-zinc-900 transition"
        >
          Annuler
        </button>
        <button
          onClick={submit}
          disabled={isPending}
          className="text-xs px-4 py-1.5 rounded-md bg-[#0D1122] text-white hover:bg-[#0D1122]/85 transition font-medium"
        >
          {isPending ? "Ajout…" : "Ajouter le contact"}
        </button>
      </div>
    </div>
  );
}
