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
  const [editingField, setEditingField] = useState<"nom" | "email" | "telephone" | "role" | null>(null);
  const [, startTransition] = useTransition();

  function commit(field: "nom" | "email" | "telephone" | "role", value: string) {
    setEditingField(null);
    const v = value.trim();
    startTransition(async () => {
      try {
        if (field === "role") {
          await updateContactRole(clientId, row.contactId, v || null);
        } else if (field === "nom") {
          if (!v) return;
          await updateContact(row.contactId, { nom: v });
        } else if (field === "email") {
          await updateContact(row.contactId, { email: v || null });
        } else if (field === "telephone") {
          await updateContact(row.contactId, { telephone: v || null });
        }
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  function onRemove() {
    if (!confirm(`Détacher ${row.nom} de ce dossier ?`)) return;
    startTransition(async () => {
      try {
        await removeContactFromClient(clientId, row.contactId);
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  function commitCivilite(v: "M." | "Mme" | "Mlle" | null) {
    startTransition(async () => {
      try {
        await updateContact(row.contactId, { civilite: v });
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-zinc-50 group">
      <CivilitePicker value={row.civilite} onChange={commitCivilite} />
      <InlineField
        value={row.nom}
        placeholder="Nom"
        editing={editingField === "nom"}
        onEdit={() => setEditingField("nom")}
        onCommit={(v) => commit("nom", v)}
        className="font-medium min-w-[100px]"
      />
      <InlineField
        value={row.role ?? ""}
        placeholder="Rôle"
        editing={editingField === "role"}
        onEdit={() => setEditingField("role")}
        onCommit={(v) => commit("role", v)}
        className="text-xs text-zinc-500"
      />
      <InlineField
        value={row.email ?? ""}
        placeholder="Email"
        editing={editingField === "email"}
        onEdit={() => setEditingField("email")}
        onCommit={(v) => commit("email", v)}
        className="text-xs text-blue-600"
        type="email"
      />
      <InlineField
        value={row.telephone ?? ""}
        placeholder="Téléphone"
        editing={editingField === "telephone"}
        onEdit={() => setEditingField("telephone")}
        onCommit={(v) => commit("telephone", v)}
        className="text-xs text-zinc-500 tabular-nums"
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
            ? "bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400"
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
                · (vide)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InlineField({
  value,
  placeholder,
  editing,
  onEdit,
  onCommit,
  className,
  type = "text",
}: {
  value: string;
  placeholder: string;
  editing: boolean;
  onEdit: () => void;
  onCommit: (v: string) => void;
  className?: string;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        ref={ref}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(draft);
          else if (e.key === "Escape") onCommit(value);
        }}
        className="px-1.5 py-0.5 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        placeholder={placeholder}
        style={{ minWidth: "120px" }}
      />
    );
  }

  return (
    <button
      onClick={onEdit}
      className={cn(
        "px-1.5 py-0.5 rounded hover:bg-zinc-100 transition text-left",
        !value && "bg-amber-50/60 text-amber-700/70",
        className
      )}
    >
      {value || placeholder}
    </button>
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
  const [nom, setNom] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!nom.trim()) {
      setError("Nom obligatoire");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addContactToClient(clientId, {
          nom: nom.trim(),
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
    <div className="mt-3 p-3 rounded-md border border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/5 space-y-2 animate-slide-up-fade">
      <div className="flex items-center gap-1">
        {(["M.", "Mme", "Mlle"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCivilite(civilite === c ? null : c)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium border transition",
              civilite === c
                ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))]"
                : "bg-white border-zinc-300 text-zinc-600 hover:border-zinc-400"
            )}
          >
            {c}
          </button>
        ))}
        <span className="text-[11px] text-zinc-500 ml-1">civilité</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Prénom NOM *"
          className="px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Rôle (ex. Président, Comptable…)"
          className="px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
        <input
          type="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="Téléphone"
          className="px-2 py-1 rounded border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60"
        />
      </div>
      {error && <div className="text-xs text-rose-700">{error}</div>}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={isPending}
          className="text-xs px-2.5 py-1 rounded-md text-zinc-600 hover:text-zinc-900 transition"
        >
          Annuler
        </button>
        <button
          onClick={submit}
          disabled={isPending}
          className="text-xs px-3 py-1 rounded-md bg-[#0D1122] text-white hover:bg-[#0D1122]/85 transition"
        >
          {isPending ? "Ajout…" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}
