"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileType2, Download, AlertTriangle, Loader2, MailPlus, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCan } from "@/app/_components/permissions-context";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast-helpers";
import type { MailTemplate } from "@/lib/mail-templates";

export type DocClient = {
  id: string;
  denomination: string;
  forme: string | null;
  pipeline_statut: string | null;
  /** Champs cœur manquants pour la LDM (avertissement, non bloquant). */
  missing: string[];
  /** Destinataire du mail : dirigeant, sinon adresse du dossier. */
  email: string | null;
};

type Template = "presentation" | "bnc" | "sociale";
const TEMPLATES: { value: Template; label: string }[] = [
  { value: "presentation", label: "Présentation" },
  { value: "bnc", label: "BNC" },
  { value: "sociale", label: "PAIE" },
];

type Mode = "ldm" | "mail";

export default function BulkDocuments({
  rows,
  mailTemplates,
}: {
  rows: DocClient[];
  mailTemplates: MailTemplate[];
}) {
  const canEdit = useCan("edit_clients");
  const [mode, setMode] = useState<Mode>("ldm");
  const [template, setTemplate] = useState<Template>("presentation");
  const [mailTemplateId, setMailTemplateId] = useState<string>(mailTemplates[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [signedOnly, setSignedOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (signedOnly && r.pipeline_statut !== "8 - LDM signée") return false;
      if (q && !r.denomination.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, signedOnly]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  /** Changer de mode : le filtre « LDM signée » n'a de sens que pour les LDM —
   *  une relance par mail s'adresse à tout le portefeuille. */
  function changeMode(m: Mode) {
    setMode(m);
    if (m === "mail") setSignedOnly(false);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => n.delete(r.id));
      else filtered.forEach((r) => n.add(r.id));
      return n;
    });
  }

  /** Télécharge le blob renvoyé par une route de génération. */
  function telecharge(blob: Blob, contentDisposition: string, defaut: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = contentDisposition.match(/filename="([^"]+)"/)?.[1] ?? defaut;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function generate() {
    const ids = [...selected];
    if (ids.length === 0) return toastError("Sélectionne au moins un dossier.");
    if (mode === "mail" && !mailTemplateId) return toastError("Choisis un modèle de mail.");

    setBusy(true);
    try {
      const res = await fetch(mode === "ldm" ? "/api/documents/bulk" : "/api/documents/mails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "ldm"
            ? { template, clientIds: ids }
            : { templateId: mailTemplateId, clientIds: ids }
        ),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      telecharge(
        blob,
        res.headers.get("Content-Disposition") ?? "",
        mode === "ldm" ? "documents.zip" : "mails.zip"
      );

      const pluriel = ids.length > 1 ? "s" : "";
      if (mode === "ldm") {
        toastSuccess(`${ids.length} document${pluriel} généré${pluriel}`);
      } else {
        toastSuccess(`${ids.length} mail${pluriel} généré${pluriel}`);
        // Un .eml sans destinataire s'ouvre quand même : on prévient plutôt
        // que de bloquer, le champ « À » sera simplement à compléter.
        const sans = decodeURIComponent(res.headers.get("X-Sans-Destinataire") ?? "");
        if (sans) toastInfo(`Sans adresse e-mail : ${sans}`);
      }
    } catch (e) {
      toastError(e, "Echec de la génération");
    } finally {
      setBusy(false);
    }
  }

  const selCount = selected.size;
  const modeleMail = mailTemplates.find((t) => t.id === mailTemplateId) ?? null;
  const pretAGenerer = mode === "ldm" || Boolean(mailTemplateId);

  const onglet =
    "px-3 py-1 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";
  const ongletActif =
    "bg-white dark:bg-white/[0.12] text-zinc-900 dark:text-zinc-50 border border-zinc-300 dark:border-white/25 shadow-card font-medium";
  const ongletInactif =
    "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-transparent";

  return (
    <div className="space-y-4">
      {/* Nature du livrable */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={() => changeMode("ldm")}
          aria-pressed={mode === "ldm"}
          className={cn(onglet, "inline-flex items-center gap-1.5", mode === "ldm" ? ongletActif : ongletInactif)}
        >
          <FileType2 className="h-3.5 w-3.5" />
          Lettres de mission
        </button>
        <button
          type="button"
          onClick={() => changeMode("mail")}
          aria-pressed={mode === "mail"}
          className={cn(onglet, "inline-flex items-center gap-1.5", mode === "mail" ? ongletActif : ongletInactif)}
        >
          <MailPlus className="h-3.5 w-3.5" />
          Mails
        </button>
      </div>

      {/* Modèle */}
      {mode === "ldm" ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Type :</span>
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.08]">
            {TEMPLATES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTemplate(t.value)}
                aria-pressed={template === t.value}
                className={cn(onglet, template === t.value ? ongletActif : ongletInactif)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ) : mailTemplates.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Aucun modèle de mail n&apos;est encore créé.</span>
          <Link
            href="/parametrage/emails"
            className="inline-flex items-center gap-1.5 shrink-0 font-medium hover:underline"
          >
            <Settings2 className="h-3 w-3" />
            Créer un modèle
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <label
            htmlFor="modele-mail"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Modèle :
          </label>
          <select
            id="modele-mail"
            value={mailTemplateId}
            onChange={(e) => setMailTemplateId(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            {mailTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.categorie ? `${t.categorie} — ${t.nom}` : t.nom}
              </option>
            ))}
          </select>
          {modeleMail && (
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
              Objet : {modeleMail.objet}
            </span>
          )}
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par dossier…"
          className="h-9 w-full sm:w-64 px-3 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        />
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
          <input type="checkbox" checked={signedOnly} onChange={(e) => setSignedOnly(e.target.checked)} className="accent-[hsl(var(--gold))]" />
          LDM signée uniquement
        </label>
        <span className="text-xs text-zinc-400 ml-auto">{filtered.length} dossier{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white dark:bg-[hsl(var(--card))] shadow-card overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-white/[0.06]">
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="accent-[hsl(var(--gold))]" aria-label="Tout sélectionner" />
              </th>
              <th className="px-3 py-2.5 font-medium">Dossier</th>
              <th className="px-3 py-2.5 font-medium">Forme</th>
              <th className="px-3 py-2.5 font-medium">{mode === "ldm" ? "Complétude" : "Destinataire"}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => toggle(r.id)}
                className={cn(
                  "border-b border-zinc-50 dark:border-white/[0.04] last:border-0 cursor-pointer transition-colors",
                  selected.has(r.id) ? "bg-[hsl(var(--gold))]/[0.06]" : "hover:bg-zinc-50/60 dark:hover:bg-white/[0.02]"
                )}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-[hsl(var(--gold))]" />
                </td>
                <td className="px-3 py-2.5 font-medium">{r.denomination}</td>
                <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">{r.forme ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {mode === "ldm" ? (
                    r.missing.length === 0 ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Complet</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300"
                        title={`Manque : ${r.missing.join(", ")}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {r.missing.length} champ{r.missing.length > 1 ? "s" : ""} manquant{r.missing.length > 1 ? "s" : ""}
                      </span>
                    )
                  ) : r.email ? (
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{r.email}</span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300"
                      title="Le mail sera généré avec un champ « À » vide"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Aucune adresse
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-400">Aucun dossier.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barre d'action */}
      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-200/70 dark:border-white/[0.08] bg-white/95 dark:bg-[hsl(var(--card))]/95 backdrop-blur px-4 py-3 shadow-card">
        <span className="text-sm text-zinc-600 dark:text-zinc-300">
          {selCount === 0 ? "Aucun dossier sélectionné" : `${selCount} dossier${selCount > 1 ? "s" : ""} sélectionné${selCount > 1 ? "s" : ""}`}
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={!canEdit || busy || selCount === 0 || !pretAGenerer}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            canEdit && !busy && selCount > 0 && pretAGenerer
              ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white"
              : "bg-zinc-200 dark:bg-white/[0.08] text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? "Génération…" : `Générer le ZIP (${selCount})`}
        </button>
      </div>

      <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
        {mode === "ldm" ? (
          <>
            <FileType2 className="h-3 w-3" />
            Les documents sortent en brouillon (.docx). Les champs manquants apparaîtront vides —
            complète les dossiers signalés avant.
          </>
        ) : (
          <>
            <MailPlus className="h-3 w-3" />
            Un fichier .eml par dossier : double-clic pour l&apos;ouvrir dans Outlook en brouillon.
            Rien n&apos;est envoyé automatiquement.
          </>
        )}
      </p>
    </div>
  );
}
