"use client";

import { useState } from "react";
import { FileText, ChevronDown } from "lucide-react";

/**
 * Bouton "Générer LDM" avec menu déroulant (Présentation / BNC).
 * Déclenche le téléchargement du .docx via /api/clients/[id]/ldm.
 */
export default function LDMButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);

  function generate(tpl: "presentation" | "bnc") {
    window.location.href = `/api/clients/${clientId}/ldm?template=${tpl}`;
    setOpen(false);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--gold))] text-white text-xs font-medium hover:opacity-90 transition shadow-sm"
      >
        <FileText className="h-3.5 w-3.5" />
        Générer LDM
        <ChevronDown className="h-3 w-3 opacity-80" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-lg border bg-white shadow-xl overflow-hidden animate-slide-up-fade">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => generate("presentation")}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--gold))]/10 transition-colors"
          >
            LDM Présentation
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => generate("bnc")}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--gold))]/10 transition-colors border-t"
          >
            LDM BNC
          </button>
        </div>
      )}
    </div>
  );
}
