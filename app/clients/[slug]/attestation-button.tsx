"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { FileCheck2, ChevronDown, FileType2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { YearSelect } from "@/app/_components/year-select";

/**
 * Bouton "Générer attestation" (séparé de "Générer LDM").
 * Menu déroulant des modèles d'attestation ; extensible au fil des modèles.
 * Pour l'instant : Attestation de CA (chiffre d'affaires), avec boîte de
 * dialogue de paramétrage.
 */
export default function AttestationButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [caOpen, setCaOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-white/[0.08] transition shadow-sm"
      >
        <FileCheck2 className="h-3.5 w-3.5" />
        Générer attestation
        <ChevronDown className="h-3 w-3 opacity-80" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-lg border bg-white dark:bg-[hsl(var(--card))] dark:border-white/[0.10] shadow-xl overflow-hidden animate-slide-up-fade">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-50/60 dark:bg-white/[0.03] border-b dark:border-white/[0.06]">
            Chiffre d&apos;affaires
          </div>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setOpen(false); setCaOpen(true); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--gold))]/10 transition-colors flex items-center gap-2"
          >
            <FileType2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="flex-1">Word (.docx)</span>
            <span className="text-[10px] text-zinc-400">à paramétrer…</span>
          </button>
        </div>
      )}

      {caOpen && <AttestationCADialog clientId={clientId} onClose={() => setCaOpen(false)} />}
    </div>
  );
}

function AttestationCADialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const now = new Date();
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [motif, setMotif] = useState("");
  const [annee, setAnnee] = useState<number | null>(now.getFullYear());
  const [ca, setCa] = useState("");

  const anneeOpts = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  function frOf(iso: string): string {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  }

  function generate() {
    const qs = new URLSearchParams({
      template: "ca",
      date_debut: frOf(dateDebut),
      date_fin: frOf(dateFin),
      motif: motif.trim(),
      annee: String(annee ?? now.getFullYear()),
      ca: ca.trim(),
    });
    window.location.href = `/api/clients/${clientId}/attestation?${qs.toString()}`;
    onClose();
  }

  const valid = dateDebut && dateFin && motif.trim() && annee != null && ca.trim();

  const inputCls =
    "w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]";
  const labelCls = "text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-900/50 dark:bg-[hsl(226_85%_3%_/_0.6)] backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Attestation de CA, paramétrage</h3>
          <button type="button" onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Période, du</label>
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={cn(inputCls, "tabular-nums")} />
            </div>
            <div>
              <label className={labelCls}>au</label>
              <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={cn(inputCls, "tabular-nums")} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Montant du chiffre d&apos;affaires</label>
            <div className="relative">
              <input inputMode="decimal" value={ca} onChange={(e) => setCa(e.target.value)} placeholder="ex. 77332.60" className={cn(inputCls, "pr-10 tabular-nums")} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">€ HT</span>
            </div>
          </div>

          <div>
            <label className={labelCls}>Année de la mission de présentation</label>
            <YearSelect years={anneeOpts} value={annee} onChange={setAnnee} className="text-sm" />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Détermine «&nbsp;l&apos;exercice se clôturant au …&nbsp;» (clôture du dossier).
            </p>
          </div>

          <div>
            <label className={labelCls}>Motif / cadre de l&apos;attestation</label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={2}
              placeholder="ex. Conclusion d'un contrat de bail, par l'un des dirigeants."
              className={inputCls}
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors">
            Annuler
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={!valid}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              valid ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white" : "bg-zinc-200 dark:bg-white/[0.08] text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            )}
          >
            Générer le .docx
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
