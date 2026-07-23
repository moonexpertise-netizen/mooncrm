"use client";

import { useState } from "react";
import { FileText, ChevronDown, AlertTriangle, FileType2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bouton "Générer LDM" avec menu déroulant.
 * Deux options : Présentation / BNC, au format Word (.docx éditable).
 *  - route /api/clients/:id/ldm (template Word docxtemplater)
 *
 * Bloqué tant qu'un dirigeant complet (civilité + prénom + nom) n'est pas
 * rattaché - sans ces infos la salutation et l'identification ne peuvent pas
 * être correctement remplies dans la LDM.
 */
export default function LDMButton({
  clientId,
  dirigeant,
}: {
  clientId: string;
  dirigeant: {
    civilite: "M." | "Mme" | "Mlle" | null;
    prenom: string | null;
    nom: string;
    email: string | null;
    telephone: string | null;
  } | null;
}) {
  const [open, setOpen] = useState(false);

  function generate(tpl: "presentation" | "bnc" | "sociale") {
    window.location.href = `/api/clients/${clientId}/ldm?template=${tpl}`;
    setOpen(false);
  }

  if (!dirigeant) {
    return (
      <button
        disabled
        title="Ajouter un contact dirigeant avant de générer la LDM (carte Contacts ↓)"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-400 text-xs font-medium cursor-not-allowed shadow-sm"
      >
        <FileText className="h-3.5 w-3.5" />
        Générer LDM
        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          Contact requis
        </span>
      </button>
    );
  }

  const incompleteFields: string[] = [];
  if (!dirigeant.civilite) incompleteFields.push("civilité");
  if (!dirigeant.prenom) incompleteFields.push("prénom");
  if (incompleteFields.length > 0) {
    return (
      <button
        disabled
        title={`Compléter le dirigeant (${incompleteFields.join(", ")}) avant de générer la LDM`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-400 text-xs font-medium cursor-not-allowed shadow-sm"
      >
        <FileText className="h-3.5 w-3.5" />
        Générer LDM
        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          Manque {incompleteFields.join(", ")}
        </span>
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--gold))] dark:bg-[hsl(34_32%_22%)] text-white dark:text-[hsl(38_55%_82%)] text-xs font-medium hover:opacity-90 dark:hover:bg-[hsl(34_32%_28%)] transition shadow-sm"
      >
        <FileText className="h-3.5 w-3.5" />
        Générer LDM
        <ChevronDown className="h-3 w-3 opacity-80" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-lg border bg-white shadow-xl overflow-hidden animate-slide-up-fade">
          {/* Présentation */}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-50/60 border-b">
            Présentation
          </div>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => generate("presentation")}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--gold))]/10 transition-colors flex items-center gap-2"
          >
            <FileType2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="flex-1">Word (.docx)</span>
            <span className="text-[10px] text-zinc-400">éditable</span>
          </button>

          {/* BNC */}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-50/60 border-y">
            BNC
          </div>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => generate("bnc")}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--gold))]/10 transition-colors flex items-center gap-2"
          >
            <FileType2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="flex-1">Word (.docx)</span>
            <span className="text-[10px] text-zinc-400">éditable</span>
          </button>

          {/* Sociale (gestion de la paie) : seuls identité + adresse sont
              personnalisées, le reste du modèle est fixe. */}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-50/60 border-y">
            Sociale (paie)
          </div>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => generate("sociale")}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--gold))]/10 transition-colors flex items-center gap-2"
          >
            <FileType2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="flex-1">Word (.docx)</span>
            <span className="text-[10px] text-zinc-400">éditable</span>
          </button>
        </div>
      )}
    </div>
  );
}
