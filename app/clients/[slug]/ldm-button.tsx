"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { FileText, ChevronDown, AlertTriangle, FileType2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPES_ATTESTATION = ["directe", "indirecte", "de concordance"] as const;

/** Agrégats proposés (l'article est inclus : la phrase est "portant sur …"). */
const AGREGATS = [
  "le montant des dépenses liées à un programme BPI",
  "la régularité fiscale et sociale",
  "le Chiffre d'affaires",
  "les Capitaux propres",
  "le Compte courant",
  "le Capital social",
  "le Résultat net",
  "les Dividendes distribués",
];

/**
 * Bouton "Générer LDM" avec menu déroulant.
 * Modèles : Présentation / BNC / PAIE / Attestation, au format Word (.docx).
 *  - route /api/clients/:id/ldm (template Word docxtemplater)
 *  - Attestation : ouvre d'abord une boîte de dialogue (type, tarif, agrégat)
 *    puis passe ces champs à la route en query.
 *
 * Bloqué tant qu'un dirigeant complet (civilité + prénom + nom) n'est pas
 * rattaché - sans ces infos la salutation et l'identification ne peuvent pas
 * être correctement remplies dans la LDM.
 */
export default function LDMButton({
  clientId,
  dirigeant,
  missingFields = [],
}: {
  clientId: string;
  dirigeant: {
    civilite: "M." | "Mme" | "Mlle" | null;
    prenom: string | null;
    nom: string;
    email: string | null;
    telephone: string | null;
  } | null;
  /** Champs obligatoires LDM encore vides. On AVERTIT sans bloquer : Benjamin
   *  garde la possibilité de sortir un brouillon à relire. */
  missingFields?: string[];
}) {
  const [open, setOpen] = useState(false);

  // Boîte de dialogue attestation (3 champs saisis avant génération).
  const [attOpen, setAttOpen] = useState(false);
  const [attType, setAttType] = useState<string>("directe");
  const [attTarif, setAttTarif] = useState<string>("");
  const [attAgregat, setAttAgregat] = useState<string>(AGREGATS[2]); // Chiffre d'affaires par défaut
  const [attLibre, setAttLibre] = useState<string>("");
  const [attModeLibre, setAttModeLibre] = useState(false);

  function generate(tpl: "presentation" | "bnc" | "sociale") {
    window.location.href = `/api/clients/${clientId}/ldm?template=${tpl}`;
    setOpen(false);
  }

  function generateAttestation() {
    const portant = attModeLibre ? attLibre.trim() : attAgregat;
    const tarif = attTarif.replace(",", ".").replace(/[^\d.]/g, "");
    const qs = new URLSearchParams({
      template: "attestation",
      type_attestation: attType,
      portant_sur: portant,
      tarif,
    });
    window.location.href = `/api/clients/${clientId}/ldm?${qs.toString()}`;
    setAttOpen(false);
  }

  const attValid =
    attTarif.trim().length > 0 &&
    (attModeLibre ? attLibre.trim().length > 0 : attAgregat.length > 0);

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
          {/* Avertissement de complétude : la LDM reste générable (brouillon),
              mais on annonce clairement ce qui sortira vide. */}
          {missingFields.length > 0 && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-900">
              <div className="flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3 w-3" />
                {missingFields.length} champ{missingFields.length > 1 ? "s" : ""} manquant{missingFields.length > 1 ? "s" : ""}
              </div>
              <div className="mt-0.5 text-amber-800">{missingFields.join(", ")}</div>
            </div>
          )}
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

          {/* PAIE (gestion de la paie) : seuls identité + adresse sont
              personnalisées, le reste du modèle est fixe. */}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-50/60 border-y">
            PAIE
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

          {/* ATTESTATION : 3 champs à saisir avant génération -> ouvre une
              boîte de dialogue plutôt que de télécharger directement. */}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-50/60 border-y">
            Attestation
          </div>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              setAttOpen(true);
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--gold))]/10 transition-colors flex items-center gap-2"
          >
            <FileType2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="flex-1">Word (.docx)</span>
            <span className="text-[10px] text-zinc-400">à paramétrer…</span>
          </button>
        </div>
      )}

      {attOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-zinc-900/50 dark:bg-[hsl(226_85%_3%_/_0.6)] backdrop-blur-md"
              onClick={() => setAttOpen(false)}
              aria-hidden
            />
            <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-[hsl(var(--surface-elevated))] shadow-modal border border-zinc-200/70 dark:border-white/[0.08] overflow-hidden animate-slide-up-fade">
              <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  LDM Attestation, paramétrage
                </h3>
                <button
                  type="button"
                  onClick={() => setAttOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Type d'attestation */}
                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                    Type d&apos;attestation
                  </label>
                  <select
                    value={attType}
                    onChange={(e) => setAttType(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  >
                    {TYPES_ATTESTATION.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Tarif */}
                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                    Tarif
                  </label>
                  <div className="flex items-center gap-1 px-2 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={attTarif}
                      onChange={(e) => setAttTarif(e.target.value)}
                      placeholder="ex. 500"
                      className="w-full px-1 py-1.5 text-sm tabular-nums bg-transparent focus:outline-none text-zinc-900 dark:text-zinc-100"
                    />
                    <span className="text-[11px] text-zinc-400">€ HT</span>
                  </div>
                </div>

                {/* Agrégat attesté */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Agrégat attesté <span className="text-zinc-400 font-normal">(portant sur…)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setAttModeLibre((v) => !v)}
                      className="text-[11px] text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] hover:underline"
                    >
                      {attModeLibre ? "Choisir dans la liste" : "Saisie libre"}
                    </button>
                  </div>
                  {attModeLibre ? (
                    <input
                      type="text"
                      value={attLibre}
                      onChange={(e) => setAttLibre(e.target.value)}
                      autoFocus
                      placeholder="ex. le montant des dépenses de R&D…"
                      className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                  ) : (
                    <select
                      value={attAgregat}
                      onChange={(e) => setAttAgregat(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    >
                      {AGREGATS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  )}
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                    Phrase générée : «&nbsp;une attestation {attType}, portant sur{" "}
                    {(attModeLibre ? attLibre : attAgregat) || "…"}&nbsp;».
                  </p>
                </div>
              </div>

              <div className="px-5 py-3 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAttOpen(false)}
                  className="px-3 py-1.5 rounded-md text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={generateAttestation}
                  disabled={!attValid}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    attValid
                      ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white"
                      : "bg-zinc-200 dark:bg-white/[0.08] text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
                  )}
                >
                  Générer le .docx
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
