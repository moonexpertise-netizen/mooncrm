"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { addContactToClient } from "./actions";
import { useCan } from "@/app/_components/permissions-context";
import { toastError } from "@/lib/toast-helpers";

/**
 * Création du dirigeant directement depuis l'onglet Informations.
 *
 * Le dirigeant est un `contact` en base (c'est lui qui alimente la LDM), mais
 * la carte "Contacts" a été retirée de la fiche : sans ce bouton, un dossier
 * sans dirigeant serait dans une impasse. Formulaire minimal : civilité + nom
 * + prénom, le reste s'édite ensuite en ligne.
 */
export default function AddDirigeantButton({ clientId }: { clientId: string }) {
  const canEdit = useCan("edit_clients");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [civilite, setCivilite] = useState<"M." | "Mme" | "">("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");

  if (!canEdit) {
    return (
      <div className="px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
        Aucun dirigeant rattaché.
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-xs text-amber-700 dark:text-amber-300">Aucun dirigeant rattaché.</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs px-2 py-1 rounded-md border border-zinc-200 dark:border-white/[0.10] hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors"
        >
          + Ajouter le dirigeant
        </button>
      </div>
    );
  }

  function submit() {
    if (!nom.trim()) {
      toastError("Le nom du dirigeant est obligatoire.");
      return;
    }
    startTransition(async () => {
      try {
        await addContactToClient(clientId, {
          nom: nom.trim(),
          prenom: prenom.trim() || null,
          email: null,
          telephone: null,
          role: "Dirigeant",
          civilite: civilite || null,
        });
        setOpen(false);
        setNom("");
        setPrenom("");
        setCivilite("");
        router.refresh();
      } catch (e) {
        toastError(e, "Echec de la creation du dirigeant");
      }
    });
  }

  const inputCls =
    "w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.04] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30";

  return (
    <div className="space-y-2 py-1">
      <div className="flex gap-1">
        {(["M.", "Mme"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCivilite(c)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs border transition",
              civilite === c
                ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))]"
                : "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.10] text-zinc-600 dark:text-zinc-300"
            )}
          >
            {c === "M." ? "Monsieur" : "Madame"}
          </button>
        ))}
      </div>
      <input
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Nom (obligatoire)"
        className={inputCls}
      />
      <input
        value={prenom}
        onChange={(e) => setPrenom(e.target.value)}
        placeholder="Prénom"
        className={inputCls}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 font-medium disabled:opacity-50"
        >
          {pending ? "…" : "Créer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
