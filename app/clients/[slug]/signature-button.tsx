"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileSignature, AlertTriangle, X, Upload, RefreshCw, FileType2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bouton "Envoyer en signature" + modale d'envoi à JeSignExpert.
 *
 * Workflow :
 *  1. L'utilisateur choisit la source du PDF :
 *     - "Depuis le CRM" : génère le PDF à la volée (route /api/.../ldm-pdf)
 *     - "Drag & drop"   : upload manuel d'un PDF déjà préparé
 *  2. Récap des signataires :
 *     - Client (dirigeant) - signe en premier
 *     - MOON Expertise (Benjamin) - contresigne ensuite
 *  3. Bouton "Envoyer" :
 *     - V1 (actuelle) : télécharge le PDF + ouvre JeSignExpert dans un onglet
 *                       avec mailto pré-rempli en attendant les credentials API.
 *     - V2 (future)   : POST direct vers l'API JeSignExpert (à brancher quand
 *                       Benjamin aura récupéré ses identifiants développeur).
 *
 * Bloqué tant qu'il manque le dirigeant complet (civilité + prénom + nom +
 * email + téléphone - tous requis pour la signature électronique).
 */

type DirigeantData = {
  civilite: "M." | "Mme" | "Mlle" | null;
  prenom: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
} | null;

export default function SignatureButton({
  clientId,
  denomination,
  finMissionDate,
  dirigeant,
}: {
  clientId: string;
  denomination: string;
  /** YYYY-MM-DD - sert à composer le nom de fichier ("…2026.pdf") */
  finMissionDate: string | null;
  dirigeant: DirigeantData;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"crm" | "upload">("crm");
  const [template, setTemplate] = useState<"presentation" | "bnc">("presentation");
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Échap pour fermer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Validations bloquantes
  if (!dirigeant) {
    return (
      <button
        disabled
        title="Ajouter un contact dirigeant avant l'envoi en signature (carte Contacts ↓)"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-400 text-xs font-medium cursor-not-allowed shadow-sm"
      >
        <FileSignature className="h-3.5 w-3.5" />
        Envoyer signature
        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          Contact requis
        </span>
      </button>
    );
  }

  const missing: string[] = [];
  if (!dirigeant.civilite) missing.push("civilité");
  if (!dirigeant.prenom) missing.push("prénom");
  if (!dirigeant.email) missing.push("email");
  if (!dirigeant.telephone) missing.push("téléphone");
  if (missing.length > 0) {
    return (
      <button
        disabled
        title={`Compléter le dirigeant (${missing.join(", ")}) avant l'envoi en signature`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-400 text-xs font-medium cursor-not-allowed shadow-sm"
      >
        <FileSignature className="h-3.5 w-3.5" />
        Envoyer signature
        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          Manque {missing.join(", ")}
        </span>
      </button>
    );
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Le fichier doit être un PDF.");
      return;
    }
    setUploadedPdf(file);
    setError(null);
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Le fichier doit être un PDF.");
      return;
    }
    setUploadedPdf(file);
    setError(null);
  }

  async function onSend() {
    setError(null);
    setGenerating(true);
    try {
      // Étape 1 : récupère le PDF (généré CRM ou uploadé)
      let pdfBlob: Blob;
      let pdfName: string;
      if (source === "crm") {
        const r = await fetch(`/api/clients/${clientId}/ldm-pdf?template=${template}`);
        if (!r.ok) {
          const json = await r.json().catch(() => ({}));
          throw new Error(json.details || json.error || `Erreur ${r.status}`);
        }
        pdfBlob = await r.blob();
        const denomClean = denomination.replace(/[\/\\:*?"<>|]/g, "").trim();
        const tplLabel = template === "presentation" ? "PRESENTATION" : "BNC";
        const annee = finMissionDate
          ? new Date(finMissionDate).getFullYear()
          : new Date().getFullYear();
        pdfName = `${denomClean} - LDM ${tplLabel} ${annee}.pdf`;
      } else {
        if (!uploadedPdf) {
          throw new Error("Aucun PDF déposé.");
        }
        pdfBlob = uploadedPdf;
        pdfName = uploadedPdf.name;
      }

      // Étape 2 : V1 - télécharge le PDF côté utilisateur et ouvre JeSignExpert
      // dans un nouvel onglet. À remplacer par un POST API JSE quand les
      // credentials seront disponibles.
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Ouvre JSE pour upload manuel + envoi
      window.open("https://www.jesignexpert.com/", "_blank", "noopener");

      setOpen(false);
      setUploadedPdf(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  const canSend = source === "crm" || (source === "upload" && uploadedPdf !== null);
  const dirigeantFullName = `${dirigeant.prenom ?? ""} ${dirigeant.nom}`.trim();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Envoyer la LDM en signature électronique"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition shadow-sm"
      >
        <FileSignature className="h-3.5 w-3.5" />
        Envoyer signature
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in p-4">
          <div className="bg-white rounded-lg shadow-2xl border max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div>
                <h3 className="text-base font-semibold tracking-tight">
                  Envoyer la LDM en signature électronique
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  via JeSignExpert · workflow client → MOON
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
              {/* Source du PDF */}
              <div>
                <div className="text-xs font-medium text-zinc-700 mb-2">
                  Source du PDF
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSource("crm")}
                    className={cn(
                      "px-3 py-3 rounded-md border-2 text-left transition",
                      source === "crm"
                        ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/5"
                        : "border-zinc-200 hover:border-zinc-300"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FileType2 className="h-4 w-4 text-rose-600" />
                      <span className="text-sm font-medium">Depuis le CRM</span>
                      {source === "crm" && (
                        <Check className="h-3.5 w-3.5 text-[hsl(var(--gold-dark))] ml-auto" />
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Génère la LDM en PDF avec les données du dossier
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource("upload")}
                    className={cn(
                      "px-3 py-3 rounded-md border-2 text-left transition",
                      source === "upload"
                        ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/5"
                        : "border-zinc-200 hover:border-zinc-300"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Upload className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Drag & drop</span>
                      {source === "upload" && (
                        <Check className="h-3.5 w-3.5 text-[hsl(var(--gold-dark))] ml-auto" />
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Dépose un PDF que tu as préparé manuellement
                    </div>
                  </button>
                </div>
              </div>

              {/* Sub-options selon source */}
              {source === "crm" && (
                <div>
                  <div className="text-xs font-medium text-zinc-700 mb-2">Template LDM</div>
                  <div className="flex gap-2">
                    {(["presentation", "bnc"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTemplate(t)}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-xs font-medium border transition",
                          template === t
                            ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))]"
                            : "bg-white border-zinc-300 text-zinc-600 hover:border-zinc-400"
                        )}
                      >
                        {t === "presentation" ? "LDM Présentation" : "LDM BNC"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {source === "upload" && (
                <div>
                  <div className="text-xs font-medium text-zinc-700 mb-2">Fichier PDF</div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "border-2 border-dashed rounded-md px-4 py-8 text-center cursor-pointer transition",
                      uploadedPdf
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-zinc-300 hover:border-zinc-400 bg-zinc-50/50"
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={onFileSelect}
                      className="hidden"
                    />
                    {uploadedPdf ? (
                      <>
                        <Check className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                        <div className="text-sm font-medium text-emerald-900">
                          {uploadedPdf.name}
                        </div>
                        <div className="text-[11px] text-emerald-700 mt-0.5">
                          {Math.round(uploadedPdf.size / 1024)} Ko · cliquer pour changer
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-zinc-400 mb-2" />
                        <div className="text-sm text-zinc-700">
                          Glisse ton PDF ici, ou clique pour parcourir
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          PDF uniquement
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Signataires */}
              <div>
                <div className="text-xs font-medium text-zinc-700 mb-2">
                  Signataires (dans l&apos;ordre)
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 px-3 py-2 rounded-md border bg-zinc-50/60">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] text-xs font-semibold flex items-center justify-center">
                      1
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {dirigeant.civilite} {dirigeantFullName}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {dirigeant.email} · {dirigeant.telephone}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 px-2 py-0.5 rounded bg-white border">
                      Client
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2 rounded-md border bg-zinc-50/60">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] text-xs font-semibold flex items-center justify-center">
                      2
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">Benjamin Perez</div>
                      <div className="text-[11px] text-zinc-500">MOON Expertise</div>
                    </div>
                    <span className="text-[10px] text-zinc-500 px-2 py-0.5 rounded bg-white border">
                      Contre-signature
                    </span>
                  </div>
                </div>
              </div>

              {/* Note V1 */}
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">Mode manuel temporaire</div>
                    <div className="mt-0.5">
                      L&apos;envoi automatique vers JeSignExpert sera branché dès
                      réception des credentials API. Pour l&apos;instant, ce bouton
                      télécharge le PDF + ouvre JeSignExpert dans un onglet pour
                      l&apos;envoi manuel.
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {error}
                </div>
              )}
            </div>

            <div className="border-t px-5 py-3 flex items-center justify-end gap-2 bg-zinc-50/50">
              <button
                onClick={() => setOpen(false)}
                disabled={generating || isPending}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 transition"
              >
                Annuler
              </button>
              <button
                onClick={onSend}
                disabled={!canSend || generating || isPending}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium transition",
                  (!canSend || generating || isPending)
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-emerald-700"
                )}
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Génération PDF…
                  </>
                ) : (
                  <>
                    <FileSignature className="h-3.5 w-3.5" />
                    Télécharger + ouvrir JeSignExpert
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
